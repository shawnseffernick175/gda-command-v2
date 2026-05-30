/**
 * LLM Router — Entry point
 *
 * Spec: docs/architecture/v3/frontend/d4-model-router.md
 * Every AI call in the backend imports `route` from this module.
 *
 * Responsibilities: task dispatch, retry, fallback, timeout, mock mode,
 * observability, cost tracking, schema validation.
 */

import { randomUUID } from 'node:crypto';
import type {
  Task,
  TaskInputMap,
  RouteRequest,
  RouteResponse,
  RouteResponseOk,
  RouteResponseErr,
  RouterErrorKind,
  QualityFlag,
  TokenUsage,
} from './llm-router.types.js';
import { getRoutingEntry } from './llm-router.table.js';
import {
  DEFAULT_RETRY,
  classifyError,
  shouldRetry,
  getBackoffMs,
} from './llm-router.retry.js';
import {
  logInvokeStart,
  logInvokeComplete,
  logInvokeFallback,
  logInvokeError,
  logInvokeTimeout,
} from './llm-router.logger.js';
import { isMockMode, loadMockFixture, shouldSimulateTimeout, shouldSimulatePrimaryFail } from './llm-router.mocks.js';
import { validateTaskOutput } from './router/schemas.js';
import { estimateCost } from './router/pricing.js';

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

type HandlerFn = (input: unknown, model: string) => Promise<{
  output: unknown;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}>;

type HandlerModule = { handle: (input: never, model: string) => Promise<{
  output: unknown;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}> };

const handlerRegistry = new Map<Task, () => Promise<HandlerModule>>();

handlerRegistry.set('fast_track_triage', () => import('./router/handlers/fast-track-triage.js') as Promise<HandlerModule>);
handlerRegistry.set('opportunity_analysis', () => import('./router/handlers/opportunity-analysis.js') as Promise<HandlerModule>);
handlerRegistry.set('capture_plan', () => import('./router/handlers/capture-plan.js') as Promise<HandlerModule>);
handlerRegistry.set('daily_briefing', () => import('./router/handlers/daily-briefing.js') as Promise<HandlerModule>);
handlerRegistry.set('sentinel_summary', () => import('./router/handlers/sentinel-summary.js') as Promise<HandlerModule>);
handlerRegistry.set('doctrine_score', () => import('./router/handlers/doctrine-score.js') as Promise<HandlerModule>);
handlerRegistry.set('semantic_embed', () => import('./router/handlers/semantic-embed.js') as Promise<HandlerModule>);
handlerRegistry.set('source_research', () => import('./router/handlers/source-research.js') as Promise<HandlerModule>);

async function getHandler(task: Task): Promise<HandlerFn> {
  const loader = handlerRegistry.get(task);
  if (!loader) throw new Error(`No handler for task: ${task}`);
  const mod = await loader();
  return mod.handle as HandlerFn;
}

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

export function validateKeys(): void {
  if (isMockMode()) return;
  const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`LLM Router: missing API keys: ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Core route function
// ---------------------------------------------------------------------------

export async function route<T extends Task>(
  req: RouteRequest<T>,
): Promise<RouteResponse<T>> {
  const traceId = randomUUID();
  const entry = getRoutingEntry(req.task);
  const timeoutMs = req.opts?.timeout_ms ?? entry.timeout_ms;
  const startTime = Date.now();
  const mock = isMockMode(req.opts?.mock);
  const disableRetry = req.opts?.disable_router_retry === true;

  logInvokeStart({
    trace_id: traceId,
    task: req.task,
    model: entry.model,
    request_id: req.opts?.operator_id,
  });

  // -------------------------------------------------------------------------
  // Mock mode
  // -------------------------------------------------------------------------
  if (mock) {
    return handleMockMode(req, traceId, entry.model, timeoutMs, startTime);
  }

  // -------------------------------------------------------------------------
  // Real mode: attempt primary with retry
  // -------------------------------------------------------------------------
  const primaryResult = await attemptWithRetry(
    req.task,
    req.input,
    entry.provider,
    entry.model,
    timeoutMs,
    startTime,
    disableRetry,
    traceId,
  );

  if (primaryResult.ok) {
    return primaryResult.response as RouteResponse<T>;
  }

  // -------------------------------------------------------------------------
  // Fallback
  // -------------------------------------------------------------------------
  if (entry.fallback && shouldAttemptFallback(primaryResult.errorClassification, timeoutMs, startTime, entry.fallback.min_remaining_budget_ms ?? 500)) {
    const elapsedMs = Date.now() - startTime;
    logInvokeFallback({
      trace_id: traceId,
      task: req.task,
      primary_model: entry.model,
      fallback_model: entry.fallback.model,
      reason: primaryResult.reason,
      primary_latency_ms: elapsedMs,
    });

    const fallbackResult = await attemptSingle(
      req.task,
      req.input,
      entry.fallback.model,
      timeoutMs,
      startTime,
      traceId,
    );

    if (fallbackResult.ok) {
      const latencyMs = Date.now() - startTime;
      const cost = estimateCost(
        entry.fallback.model,
        fallbackResult.tokens.input,
        fallbackResult.tokens.output,
      );
      logInvokeComplete({
        trace_id: traceId,
        task: req.task,
        model: fallbackResult.modelUsed,
        latency_ms: latencyMs,
        tokens: fallbackResult.tokens,
        cost_estimate_usd: cost,
      });

      return {
        ok: true,
        task: req.task,
        model_used: fallbackResult.modelUsed,
        output: fallbackResult.output as RouteResponseOk<T>['output'],
        latency_ms: latencyMs,
        tokens: fallbackResult.tokens,
        cost_estimate_usd: cost,
        fallback_used: true,
        quality_flag: 'degraded' as QualityFlag,
        trace_id: traceId,
      } as RouteResponse<T>;
    }
  }

  // -------------------------------------------------------------------------
  // Final failure
  // -------------------------------------------------------------------------
  const latencyMs = Date.now() - startTime;
  const errorKind = mapErrorKind(primaryResult.reason, req.task, timeoutMs, startTime);

  logInvokeError({
    trace_id: traceId,
    task: req.task,
    model: entry.model,
    error_code: errorKind,
    error_message: primaryResult.reason,
  });

  return {
    ok: false,
    task: req.task,
    model_used: entry.model,
    output: null,
    latency_ms: latencyMs,
    tokens: null,
    cost_estimate_usd: 0,
    fallback_used: false,
    quality_flag: 'full' as QualityFlag,
    error_kind: errorKind,
    error_message: primaryResult.reason,
    trace_id: traceId,
  } as RouteResponse<T>;
}

// ---------------------------------------------------------------------------
// Mock mode handler
// ---------------------------------------------------------------------------

async function handleMockMode<T extends Task>(
  req: RouteRequest<T>,
  traceId: string,
  model: string,
  timeoutMs: number,
  startTime: number,
): Promise<RouteResponse<T>> {
  const entry = getRoutingEntry(req.task);

  if (shouldSimulateTimeout(req.task)) {
    const latencyMs = Date.now() - startTime;
    const errorKind: RouterErrorKind = req.task === 'opportunity_analysis' ? 'ANALYSIS_TIMEOUT' : 'PROVIDER_ERROR';
    logInvokeTimeout({
      trace_id: traceId,
      task: req.task,
      model,
      budget_ms: timeoutMs,
      elapsed_ms: latencyMs,
    });
    return {
      ok: false,
      task: req.task,
      model_used: model,
      output: null,
      latency_ms: latencyMs,
      tokens: null,
      cost_estimate_usd: 0,
      fallback_used: false,
      quality_flag: 'full' as QualityFlag,
      error_kind: errorKind,
      error_message: `Mock simulated timeout for ${req.task}`,
      trace_id: traceId,
    } as RouteResponse<T>;
  }

  const fixture = loadMockFixture(req.task);
  let useFallback = false;

  if (shouldSimulatePrimaryFail(req.task) && entry.fallback) {
    useFallback = true;
  }

  const validation = validateTaskOutput(req.task, fixture.output);
  if (!validation.success) {
    return {
      ok: false,
      task: req.task,
      model_used: model,
      output: null,
      latency_ms: Date.now() - startTime,
      tokens: null,
      cost_estimate_usd: 0,
      fallback_used: false,
      quality_flag: 'full' as QualityFlag,
      error_kind: 'VALIDATION_ERROR' as RouterErrorKind,
      error_message: `Mock fixture validation failed: ${validation.error}`,
      trace_id: traceId,
    } as RouteResponse<T>;
  }

  const latencyMs = Date.now() - startTime;
  const mockModel = useFallback && entry.fallback ? entry.fallback.model : model;
  const mockTokens: TokenUsage = { input: 100, output: 50 };
  const cost = estimateCost(mockModel, mockTokens.input, mockTokens.output);

  logInvokeComplete({
    trace_id: traceId,
    task: req.task,
    model: mockModel,
    latency_ms: latencyMs,
    tokens: mockTokens,
    cost_estimate_usd: cost,
  });

  return {
    ok: true,
    task: req.task,
    model_used: mockModel,
    output: fixture.output as RouteResponseOk<T>['output'],
    latency_ms: latencyMs,
    tokens: mockTokens,
    cost_estimate_usd: cost,
    fallback_used: useFallback,
    quality_flag: useFallback ? 'degraded' : 'full',
    trace_id: traceId,
  } as RouteResponse<T>;
}

// ---------------------------------------------------------------------------
// Attempt with retry
// ---------------------------------------------------------------------------

interface AttemptResult {
  ok: boolean;
  response?: RouteResponse<Task>;
  reason: string;
  errorClassification: string;
}

async function attemptWithRetry(
  task: Task,
  input: TaskInputMap[Task],
  provider: string,
  model: string,
  timeoutMs: number,
  startTime: number,
  disableRetry: boolean,
  traceId: string,
): Promise<AttemptResult> {
  const policy = DEFAULT_RETRY;
  let lastError = '';
  let lastClassification = '';

  for (let attempt = 0; attempt <= policy.max_retries; attempt++) {
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;

    if (remaining <= 0) {
      logInvokeTimeout({ trace_id: traceId, task, model, budget_ms: timeoutMs, elapsed_ms: elapsed });
      return {
        ok: false,
        reason: `Wall-clock budget exhausted (${elapsed}ms / ${timeoutMs}ms)`,
        errorClassification: 'timeout',
      };
    }

    if (attempt > 0) {
      if (disableRetry) {
        return { ok: false, reason: lastError, errorClassification: lastClassification };
      }
      const backoff = getBackoffMs(policy, attempt - 1);
      if (elapsed + backoff > timeoutMs) {
        return {
          ok: false,
          reason: `Retry suppressed: backoff ${backoff}ms would exceed wall-clock budget`,
          errorClassification: lastClassification,
        };
      }
      await sleep(backoff);
    }

    const result = await attemptSingle(task, input, model, timeoutMs, startTime, traceId);

    if (result.ok) {
      const latencyMs = Date.now() - startTime;
      const cost = estimateCost(model, result.tokens.input, result.tokens.output);
      logInvokeComplete({
        trace_id: traceId,
        task,
        model: result.modelUsed,
        latency_ms: latencyMs,
        tokens: result.tokens,
        cost_estimate_usd: cost,
      });

      const response: RouteResponseOk<Task> = {
        ok: true,
        task,
        model_used: result.modelUsed,
        output: result.output as RouteResponseOk<Task>['output'],
        latency_ms: latencyMs,
        tokens: result.tokens,
        cost_estimate_usd: cost,
        fallback_used: false,
        quality_flag: 'full',
        trace_id: traceId,
      };

      return { ok: true, response, reason: '', errorClassification: '' };
    }

    lastError = result.error;
    lastClassification = result.classification;

    if (!shouldRetry(classifyError({ message: lastError, status: result.status, code: result.code }), policy, attempt)) {
      break;
    }
  }

  return { ok: false, reason: lastError, errorClassification: lastClassification };
}

// ---------------------------------------------------------------------------
// Single attempt
// ---------------------------------------------------------------------------

interface SingleOk {
  ok: true;
  output: unknown;
  tokens: TokenUsage;
  modelUsed: string;
}

interface SingleErr {
  ok: false;
  error: string;
  classification: string;
  status?: number;
  code?: string;
}

type SingleResult = SingleOk | SingleErr;

async function attemptSingle(
  task: Task,
  input: unknown,
  model: string,
  timeoutMs: number,
  startTime: number,
  traceId: string,
): Promise<SingleResult> {
  const remaining = timeoutMs - (Date.now() - startTime);
  if (remaining <= 0) {
    return { ok: false, error: 'Timeout before attempt', classification: 'timeout' };
  }

  try {
    const handler = await getHandler(task);
    const result = await withTimeout(handler(input, model), remaining);

    // Schema validation
    const validation = validateTaskOutput(task, result.output);
    if (!validation.success) {
      // Re-prompt once with validation error
      try {
        const retryResult = await withTimeout(handler(input, model), timeoutMs - (Date.now() - startTime));
        const retryValidation = validateTaskOutput(task, retryResult.output);
        if (!retryValidation.success) {
          return {
            ok: false,
            error: `Schema validation failed after re-prompt: ${retryValidation.error}`,
            classification: 'validation',
            status: 502,
          };
        }
        return {
          ok: true,
          output: retryValidation.data,
          tokens: { input: result.tokens_in + retryResult.tokens_in, output: result.tokens_out + retryResult.tokens_out },
          modelUsed: retryResult.model_used,
        };
      } catch {
        return {
          ok: false,
          error: `Schema validation failed: ${validation.error}`,
          classification: 'validation',
          status: 502,
        };
      }
    }

    return {
      ok: true,
      output: validation.data,
      tokens: { input: result.tokens_in, output: result.tokens_out },
      modelUsed: result.model_used,
    };
  } catch (err) {
    const e = err as Error & { status?: number; code?: string };
    const classification = classifyError({ message: e.message, status: e.status, code: e.code });
    return {
      ok: false,
      error: e.message,
      classification,
      status: e.status,
      code: e.code,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldAttemptFallback(
  errorClassification: string,
  timeoutMs: number,
  startTime: number,
  minRemainingBudgetMs: number,
): boolean {
  if (errorClassification === 'auth_error') return false;
  if (errorClassification === 'validation') return false;

  const remaining = timeoutMs - (Date.now() - startTime);
  return remaining >= minRemainingBudgetMs;
}

function mapErrorKind(
  reason: string,
  task: Task,
  timeoutMs: number,
  startTime: number,
): RouterErrorKind {
  if (reason.includes('timeout') || reason.includes('Timeout') || reason.includes('budget exhausted')) {
    return task === 'opportunity_analysis' ? 'ANALYSIS_TIMEOUT' : 'PROVIDER_ERROR';
  }
  if (reason.includes('rate limit') || reason.includes('429')) return 'RATE_LIMITED';
  if (reason.includes('auth') || reason.includes('401') || reason.includes('403')) return 'AUTH_ERROR';
  if (reason.includes('validation') || reason.includes('Schema')) return 'VALIDATION_ERROR';
  if (reason.includes('network') || reason.includes('ECONNRESET') || reason.includes('fetch failed')) return 'NETWORK_ERROR';
  return 'PROVIDER_ERROR';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
