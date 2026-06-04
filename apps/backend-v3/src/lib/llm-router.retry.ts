/**
 * LLM Router — Retry + Backoff Logic
 *
 * Implements D4 §7: exponential backoff with wall-clock constraint.
 * 429 → immediate fallback (no retry). 5xx → retry once. Network → retry 3.
 */

import type { RetryPolicy } from './llm-router.types.js';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_retries: 3,
  backoff_ms: [200, 600, 1800],
  retry_on_5xx: true,
  retry_on_network: true,
  retry_on_429: false,
};

export type RetriableError = {
  status?: number;
  code?: string;
  message: string;
};

export type RetryDecision = 'retry' | 'fallback' | 'fail';

/**
 * Decide what to do with an error per the retry policy.
 */
export function classifyError(error: RetriableError, policy: RetryPolicy): RetryDecision {
  const status = error.status;

  // 429 → immediate fallback
  if (status === 429) {
    return 'fallback';
  }

  // 4xx (non-429) → fail loud, no retry
  if (status && status >= 400 && status < 500) {
    return 'fail';
  }

  // 5xx → retry if policy allows
  if (status && status >= 500) {
    return policy.retry_on_5xx ? 'retry' : 'fail';
  }

  // Network errors (ECONNRESET, DNS, TCP, timeout)
  const networkCodes = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'];
  if (error.code && networkCodes.includes(error.code)) {
    return policy.retry_on_network ? 'retry' : 'fail';
  }

  // Generic network-like errors
  if (!status && error.message) {
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset')) {
      return policy.retry_on_network ? 'retry' : 'fail';
    }
  }

  return 'fail';
}

/**
 * Get backoff duration for a given retry attempt (0-indexed).
 */
export function getBackoffMs(attempt: number, policy: RetryPolicy): number {
  if (attempt >= policy.backoff_ms.length) {
    return policy.backoff_ms[policy.backoff_ms.length - 1]!;
  }
  return policy.backoff_ms[attempt]!;
}

/**
 * Sleep for given ms. Returns a promise that resolves after delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a provider call with retry logic and wall-clock constraint.
 * Returns the result or throws the last error encountered.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    policy: RetryPolicy;
    deadline: number; // absolute timestamp (Date.now() + timeout_ms)
    disabled?: boolean;
  },
): Promise<T> {
  if (opts.disabled) {
    return fn();
  }

  let lastError: RetriableError | null = null;
  let attempts = 0;

  while (attempts <= opts.policy.max_retries) {
    const now = Date.now();
    if (now >= opts.deadline) {
      break;
    }

    try {
      return await fn();
    } catch (err: unknown) {
      const retriable = toRetriableError(err);
      lastError = retriable;

      const decision = classifyError(retriable, opts.policy);

      if (decision === 'fallback') {
        throw Object.assign(new Error(retriable.message), { __routerFallback: true, status: retriable.status });
      }

      if (decision === 'fail') {
        throw err;
      }

      // decision === 'retry'
      // For 5xx: max 1 retry per D4 §7.2
      if (retriable.status && retriable.status >= 500 && attempts >= 1) {
        throw err;
      }

      const backoff = getBackoffMs(attempts, opts.policy);
      const remaining = opts.deadline - Date.now();
      if (backoff > remaining) {
        break;
      }

      await sleep(backoff);
      attempts++;
    }
  }

  throw lastError ?? new Error('Retry exhausted');
}

function toRetriableError(err: unknown): RetriableError {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return {
      status: typeof e['status'] === 'number' ? e['status'] : undefined,
      code: typeof e['code'] === 'string' ? e['code'] : undefined,
      message: typeof e['message'] === 'string' ? e['message'] : String(err),
    };
  }
  return { message: String(err) };
}
