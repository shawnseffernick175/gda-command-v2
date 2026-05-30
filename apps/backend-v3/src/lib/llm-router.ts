/**
 * LLM Router — Entry point.
 * Spec: docs/architecture/v3/frontend/d4-model-router.md
 *
 * Every AI call routes through route<T>(req).
 * Business logic never references model names — it references tasks.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Task,
  RouteRequest,
  RouteResponse,
  RouteResponseOk,
  RouteResponseErr,
  QualityFlag,
  RouterErrorKind,
  TokenUsage,
} from './llm-router.types.js';
import { getTableEntry } from './llm-router.table.js';
import {
  DEFAULT_RETRY_POLICY,
  isRetryable,
  isFallbackTrigger,
  is429,
  getBackoffMs,
  sleep,
  extractStatusFromCode,
} from './llm-router.retry.js';
import { isMockMode, buildMockResponse, shouldSimulateTimeout, shouldSimulatePrimaryFail } from './llm-router.mocks.js';
import { logInvokeStart, logInvokeComplete, logInvokeFallback, logInvokeError, logInvokeTimeout } from './llm-router.logger.js';
import { estimateCost } from './router/pricing.js';
import { getProvider } from './router/providers/index.js';
import { getHandler } from './router/handlers/index.js';

function validateKeys(): void {
  const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`LLM Router: missing API keys: ${missing.join(', ')}`);
  }
}

export async function route<T extends Task>(
  req: RouteRequest<T>,
): Promise<RouteResponse<T>> {
  const startTime = Date.now();
  const traceId = uuidv4();
  const entry = getTableEntry(req.task);
  const timeoutMs = req.opts?.timeout_ms ?? entry.timeout_ms;
  const mock = isMockMode(req.opts?.mock);

  if (!mock) {
    validateKeys();
  }

  logInvokeStart({
    trace_id: traceId,
    task: req.task,
    model: entry.model,
    request_id: req.opts?.operator_id,
  });

  // --- Mock mode ---
  if (mock) {
    if (shouldSimulateTimeout(req.task)) {
      const elapsed = Date.now() - startTime;
      logInvokeTimeout({
        trace_id: traceId,
        task: req.task,
        model: entry.model,
        budget_ms: timeoutMs,
        elapsed_ms: elapsed,
      });
      return buildErrorResponse(req.task, entry.model, elapsed, traceId, 'ANALYSIS_TIMEOUT', 'Simulated timeout in mock mode');
    }

    if (shouldSimulatePrimaryFail(req.task) && entry.fallback) {
      logInvokeFallback({
        trace_id: traceId,
        primary_model: entry.model,
        fallback_model: entry.fallback.model,
        reason: 'simulated_primary_fail',
        primary_latency_ms: Date.now() - startTime,
      });

      const mockResp = buildMockResponse(req.task, entry.fallback.model, startTime);
      return { ...mockResp, fallback_used: true, quality_flag: 'degraded', trace_id: traceId };
    }

    const mockResp = buildMockResponse(req.task, entry.model, startTime);
    return { ...mockResp, trace_id: traceId };
  }

  // --- Real mode ---
  const disableRetry = req.opts?.disable_router_retry === true;
  const retryPolicy = disableRetry
    ? { ...DEFAULT_RETRY_POLICY, max_retries: 0 }
    : DEFAULT_RETRY_POLICY;

  let lastError: Error | null = null;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  // Primary provider attempts
  for (let attempt = 0; attempt <= retryPolicy.max_retries; attempt++) {
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;

    if (remaining <= 0) {
      logInvokeTimeout({
        trace_id: traceId,
        task: req.task,
        model: entry.model,
        budget_ms: timeoutMs,
        elapsed_ms: elapsed,
      });
      break;
    }

    if (attempt > 0) {
      const backoff = getBackoffMs(attempt - 1, retryPolicy);
      if (remaining < backoff) break;
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    try {
      const provider = getProvider(entry.provider);
      const handler = getHandler(req.task);
      const result = await handler(req.input, {
        provider,
        model: entry.model,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - startTime;
      const cost = estimateCost(result.model_used, result.tokens_in, result.tokens_out);

      logInvokeComplete({
        trace_id: traceId,
        task: req.task,
        model: result.model_used,
        latency_ms: latency,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_estimate_usd: cost,
      });

      return {
        ok: true,
        task: req.task,
        model_used: result.model_used,
        output: result.output,
        latency_ms: latency,
        tokens: { input: result.tokens_in, output: result.tokens_out },
        cost_estimate_usd: cost,
        fallback_used: false,
        quality_flag: 'full' as QualityFlag,
        trace_id: traceId,
      } as RouteResponseOk<T>;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));

      const errInfo = {
        status: (err as { status?: number }).status,
        code: (err as NodeJS.ErrnoException).code,
        message: lastError.message,
      };

      if ((err as NodeJS.ErrnoException).code === 'INVALID_OUTPUT') {
        logInvokeError({
          trace_id: traceId,
          task: req.task,
          model: entry.model,
          error_code: 'VALIDATION_ERROR',
          error_message: lastError.message,
        });
        const latency = Date.now() - startTime;
        return buildErrorResponse(req.task, entry.model, latency, traceId, 'VALIDATION_ERROR', lastError.message);
      }

      if (is429(errInfo) && entry.fallback) {
        break;
      }

      if (!isRetryable(errInfo, retryPolicy)) {
        logInvokeError({
          trace_id: traceId,
          task: req.task,
          model: entry.model,
          error_code: classifyError(errInfo),
          error_message: lastError.message,
        });
        if (isFallbackTrigger(errInfo) && entry.fallback) {
          break;
        }
        const latency = Date.now() - startTime;
        return buildErrorResponse(req.task, entry.model, latency, traceId, classifyError(errInfo), lastError.message);
      }
    }
  }

  // --- Fallback ---
  if (entry.fallback && lastError) {
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    const minBudget = entry.fallback.min_remaining_budget_ms ?? 500;

    if (remaining >= minBudget) {
      logInvokeFallback({
        trace_id: traceId,
        primary_model: entry.model,
        fallback_model: entry.fallback.model,
        reason: lastError.message,
        primary_latency_ms: elapsed,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);

      try {
        const fallbackProvider = getProvider(entry.fallback.provider);
        const handler = getHandler(req.task);
        const result = await handler(req.input, {
          provider: fallbackProvider,
          model: entry.fallback.model,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latency = Date.now() - startTime;
        const cost = estimateCost(result.model_used, result.tokens_in, result.tokens_out);

        logInvokeComplete({
          trace_id: traceId,
          task: req.task,
          model: result.model_used,
          latency_ms: latency,
          tokens_in: result.tokens_in,
          tokens_out: result.tokens_out,
          cost_estimate_usd: cost,
        });

        return {
          ok: true,
          task: req.task,
          model_used: result.model_used,
          output: result.output,
          latency_ms: latency,
          tokens: { input: result.tokens_in, output: result.tokens_out },
          cost_estimate_usd: cost,
          fallback_used: true,
          quality_flag: 'degraded' as QualityFlag,
          trace_id: traceId,
        } as RouteResponseOk<T>;
      } catch (fallbackErr) {
        clearTimeout(timer);
        const fallbackError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
        logInvokeError({
          trace_id: traceId,
          task: req.task,
          model: entry.fallback.model,
          error_code: classifyErrorFromException(fallbackErr),
          error_message: fallbackError.message,
        });
      }
    }
  }

  // All attempts exhausted
  const finalLatency = Date.now() - startTime;
  const errorKind = req.task === 'opportunity_analysis' && finalLatency >= timeoutMs
    ? 'ANALYSIS_TIMEOUT' as RouterErrorKind
    : classifyErrorFromException(lastError);

  if (errorKind === 'ANALYSIS_TIMEOUT') {
    logInvokeTimeout({
      trace_id: traceId,
      task: req.task,
      model: entry.model,
      budget_ms: timeoutMs,
      elapsed_ms: finalLatency,
    });
  }

  return buildErrorResponse(
    req.task,
    entry.model,
    finalLatency,
    traceId,
    errorKind,
    lastError?.message ?? 'Unknown error',
  );
}

function buildErrorResponse<T extends Task>(
  task: T,
  model: string,
  latency: number,
  traceId: string,
  errorKind: RouterErrorKind,
  errorMessage: string,
): RouteResponseErr<T> {
  return {
    ok: false,
    task,
    model_used: model,
    output: null,
    latency_ms: latency,
    tokens: null,
    cost_estimate_usd: 0,
    fallback_used: false,
    quality_flag: 'full',
    error_kind: errorKind,
    error_message: errorMessage,
    trace_id: traceId,
  };
}

function classifyError(err: { status?: number; code?: string }): RouterErrorKind {
  const status = err.status ?? extractStatusFromCode(err.code);
  if (status === 429) return 'RATE_LIMITED';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status !== undefined && status >= 400 && status < 500) return 'VALIDATION_ERROR';
  if (status !== undefined && status >= 500) return 'PROVIDER_ERROR';

  const code = err.code ?? '';
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return 'NETWORK_ERROR';
  }
  if (code === 'ABORT_ERR') {
    return 'ANALYSIS_TIMEOUT';
  }
  if (code === 'INVALID_OUTPUT') {
    return 'VALIDATION_ERROR';
  }

  return 'PROVIDER_ERROR';
}

function classifyErrorFromException(err: unknown): RouterErrorKind {
  if (!err) return 'PROVIDER_ERROR';
  return classifyError({
    status: (err as { status?: number }).status,
    code: (err as NodeJS.ErrnoException).code,
  });
}
