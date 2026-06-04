/**
 * LLM Router — Real Implementation (F-215 D4)
 *
 * Single typed entry point: route<T>(req) → Promise<RouteResponse<T>>
 * Business logic references tasks, never model names.
 * Owns retry, fallback, timeout, mock, logging, and cost tracking.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  Task,
  RouteRequest,
  RouteResponse,
  RouteResponseOk,
  RouteResponseErr,
  RouterErrorKind,
  TokenUsage,
  QualityFlag,
  SemanticEmbedInput,
  SourceResearchInput,
} from './llm-router.types.js';
import { getRoutingEntry } from './llm-router.table.js';
import { DEFAULT_RETRY_POLICY, withRetry, classifyError } from './llm-router.retry.js';
import { logLlmCall } from './llm-router.logger.js';
import { mockRegistry, hashInput, getDefaultMock } from './llm-router.mocks.js';
import { callAnthropic } from './providers/anthropic.js';
import { callOpenAIEmbed } from './providers/openai.js';
import { callPerplexity } from './providers/perplexity.js';

/** Cost per token by model. */
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 0.00000025, output: 0.00000125 },
  'claude-sonnet-4-5': { input: 0.000003, output: 0.000015 },
  'claude-opus-4-5': { input: 0.000015, output: 0.000075 },
  'text-embedding-3-large': { input: 0.00000013, output: 0 },
  'sonar-pro': { input: 0.000003, output: 0.000015 },
};

function estimateCost(model: string, tokens: TokenUsage): number {
  const rates = COST_TABLE[model];
  if (!rates) return 0;
  return tokens.input * rates.input + tokens.output * rates.output;
}

/** Shared database pool reference — set via initRouter(). */
let dbPool: Pool | null = null;

/**
 * Initialize the router with a database pool for logging.
 * Call once at server startup.
 */
export function initRouter(pool: Pool | null): void {
  dbPool = pool;
}

/**
 * Validate required API keys at startup.
 * PERPLEXITY_API_KEY is intentionally optional — only checked at call time.
 */
export function validateKeys(): void {
  const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`LLM Router: missing API keys: ${missing.join(', ')}`);
  }
}

/**
 * Check if mock mode is active (env or request-level).
 * Supports MOCK_LLM=1 (D4 spec) and LLM_ROUTER_MODE=mock (legacy integration tests).
 */
function isMockMode(opts?: { mock?: boolean }): boolean {
  return opts?.mock === true || process.env['MOCK_LLM'] === '1' || process.env['LLM_ROUTER_MODE'] === 'mock';
}

/**
 * Call a provider for the given task/model combination.
 * Returns parsed output + token usage.
 */
async function callProvider(
  task: Task,
  provider: string,
  model: string,
  input: unknown,
  timeoutMs: number,
): Promise<{ output: unknown; tokens: TokenUsage; model_used: string }> {
  if (provider === 'anthropic') {
    const result = await callAnthropic({ model, task, input, timeout_ms: timeoutMs });
    const parsed = parseJsonResponse(result.text);
    return {
      output: parsed,
      tokens: { input: result.tokens_input, output: result.tokens_output },
      model_used: result.model,
    };
  }

  if (provider === 'openai') {
    const embedInput = input as SemanticEmbedInput;
    const result = await callOpenAIEmbed({ model, text: embedInput.text, timeout_ms: timeoutMs });
    return {
      output: { embedding: result.embedding, dimensions: result.dimensions },
      tokens: { input: result.tokens_input, output: 0 },
      model_used: result.model,
    };
  }

  if (provider === 'perplexity') {
    const researchInput = input as SourceResearchInput;
    const result = await callPerplexity({
      model,
      query: researchInput.query,
      context: researchInput.context,
      timeout_ms: timeoutMs,
    });
    const parsed = parseJsonResponse(result.text);
    return {
      output: parsed,
      tokens: { input: result.tokens_input, output: result.tokens_output },
      model_used: result.model,
    };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Parse JSON from LLM text response. Handles markdown code blocks.
 */
function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();
  // Strip markdown code blocks
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence >= 0) {
      cleaned = cleaned.slice(0, lastFence);
    }
  }
  cleaned = cleaned.trim();
  return JSON.parse(cleaned);
}

/**
 * Main router entry point.
 * Every AI call in the backend imports this function.
 */
async function route<T extends Task>(
  request: RouteRequest<T>,
): Promise<RouteResponse<T>> {
  const { task, input, opts } = request;
  const traceId = randomUUID();
  const startTime = Date.now();

  // Mock mode — CI and local dev
  if (isMockMode(opts)) {
    const inputH = hashInput(input);
    const cached = mockRegistry.get(task, inputH);
    if (cached) return { ...cached, trace_id: traceId };
    return getDefaultMock(task, traceId);
  }

  const entry = getRoutingEntry(task);
  const timeoutMs = opts?.timeout_ms ?? entry.timeout_ms;
  const deadline = startTime + timeoutMs;
  const disableRetry = opts?.disable_router_retry ?? false;

  let lastError: { message: string; status?: number; kind?: RouterErrorKind } | null = null;
  let primaryTokens: TokenUsage | null = null;
  let primaryModelUsed: string | null = null;
  let fallbackAttempted = false;

  // Attempt primary provider with retry
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw Object.assign(new Error('Timeout before primary call'), { __routerTimeout: true });
    }

    const result = await withRetry(
      () => callProvider(task, entry.provider, entry.model, input, remaining),
      { policy: DEFAULT_RETRY_POLICY, deadline, disabled: disableRetry },
    );

    const tokens = result.tokens;
    const cost = estimateCost(result.model_used, tokens);
    const latencyMs = Date.now() - startTime;

    // Log successful primary call
    await logLlmCall(dbPool, {
      trace_id: traceId,
      task,
      provider: entry.provider,
      model: result.model_used,
      operator_id: opts?.operator_id ?? null,
      object_ref: opts?.object_ref ?? null,
      latency_ms: latencyMs,
      tokens_input: tokens.input,
      tokens_output: tokens.output,
      cost_estimate_usd: cost,
      fallback_used: false,
      error_kind: null,
    });

    return {
      ok: true,
      task,
      model_used: result.model_used,
      output: result.output as RouteResponseOk<T>['output'],
      latency_ms: latencyMs,
      tokens,
      cost_estimate_usd: cost,
      fallback_used: false,
      quality_flag: 'full',
      trace_id: traceId,
    };
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; __routerFallback?: boolean; __routerTimeout?: boolean; __routerNoRetry?: boolean };
    primaryModelUsed = entry.model;

    // Determine error kind
    let errorKind: RouterErrorKind = 'PROVIDER_ERROR';
    if (e.__routerTimeout || Date.now() >= deadline) {
      errorKind = task === 'opportunity_analysis' ? 'ANALYSIS_TIMEOUT' : 'PROVIDER_ERROR';
    } else if (e.status === 429) {
      errorKind = 'RATE_LIMITED';
    } else if (e.status === 401 || e.status === 403) {
      errorKind = 'AUTH_ERROR';
    } else if (e.__routerNoRetry && e.status === 401) {
      errorKind = 'AUTH_ERROR';
    }

    lastError = { message: e.message ?? 'Unknown error', status: e.status, kind: errorKind };

    // Log failed primary attempt
    const primaryLatency = Date.now() - startTime;
    await logLlmCall(dbPool, {
      trace_id: traceId,
      task,
      provider: entry.provider,
      model: entry.model,
      operator_id: opts?.operator_id ?? null,
      object_ref: opts?.object_ref ?? null,
      latency_ms: primaryLatency,
      tokens_input: null,
      tokens_output: null,
      cost_estimate_usd: null,
      fallback_used: false,
      error_kind: errorKind,
    });

    // Attempt fallback if configured and time remains
    if (entry.fallback) {
      const remaining = deadline - Date.now();
      const minBudget = entry.fallback.min_remaining_budget_ms ?? 500;

      if (remaining >= minBudget) {
        fallbackAttempted = true;
        try {
          const fbResult = await callProvider(
            task,
            entry.fallback.provider,
            entry.fallback.model,
            input,
            remaining,
          );

          const tokens = fbResult.tokens;
          const cost = estimateCost(fbResult.model_used, tokens);
          const latencyMs = Date.now() - startTime;

          // Log successful fallback call
          await logLlmCall(dbPool, {
            trace_id: traceId,
            task,
            provider: entry.fallback.provider,
            model: fbResult.model_used,
            operator_id: opts?.operator_id ?? null,
            object_ref: opts?.object_ref ?? null,
            latency_ms: latencyMs,
            tokens_input: tokens.input,
            tokens_output: tokens.output,
            cost_estimate_usd: cost,
            fallback_used: true,
            error_kind: null,
          });

          return {
            ok: true,
            task,
            model_used: fbResult.model_used,
            output: fbResult.output as RouteResponseOk<T>['output'],
            latency_ms: latencyMs,
            tokens,
            cost_estimate_usd: cost,
            fallback_used: true,
            quality_flag: 'degraded',
            trace_id: traceId,
          };
        } catch (fbErr: unknown) {
          // Fallback also failed — fall through to error response
          const fe = fbErr as { message?: string };
          lastError = { ...lastError, message: fe.message ?? lastError.message };
        }
      }
    }
  }

  // Return error response
  const latencyMs = Date.now() - startTime;
  const errorKind = lastError?.kind ?? 'PROVIDER_ERROR';

  // For opportunity_analysis, if we timed out, always return ANALYSIS_TIMEOUT
  const finalErrorKind: RouterErrorKind =
    task === 'opportunity_analysis' && Date.now() >= deadline
      ? 'ANALYSIS_TIMEOUT'
      : errorKind;

  return {
    ok: false,
    task,
    model_used: primaryModelUsed,
    output: null,
    latency_ms: latencyMs,
    tokens: primaryTokens,
    cost_estimate_usd: 0,
    fallback_used: fallbackAttempted,
    quality_flag: 'degraded',
    error_kind: finalErrorKind,
    error_message: lastError?.message ?? 'Unknown error',
    trace_id: traceId,
  } as RouteResponse<T>;
}

export const llmRouter = { route };
