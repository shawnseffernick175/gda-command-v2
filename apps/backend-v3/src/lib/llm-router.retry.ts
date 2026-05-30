/**
 * Retry + backoff logic per D4 §7.
 */

import type { RetryPolicy } from './llm-router.types.js';

export const DEFAULT_RETRY: RetryPolicy = {
  max_retries: 3,
  backoff_ms: [200, 600, 1800] as const,
  retry_on_5xx: true,
  retry_on_network: true,
  retry_on_429: false,
};

export interface RetryableError {
  status?: number;
  code?: string;
  message: string;
}

export type ErrorClassification =
  | 'retriable_network'
  | 'retriable_5xx'
  | 'rate_limited'
  | 'auth_error'
  | 'validation_error'
  | 'non_retriable';

export function classifyError(err: RetryableError): ErrorClassification {
  const code = err.code ?? '';
  const status = err.status ?? 0;

  if (
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'EPIPE' ||
    err.message.includes('fetch failed') ||
    err.message.includes('network')
  ) {
    return 'retriable_network';
  }

  if (status === 429 || code === '429') {
    return 'rate_limited';
  }

  if (status >= 500 || (Number(code) >= 500 && Number(code) < 600)) {
    return 'retriable_5xx';
  }

  if (status === 401 || status === 403) {
    return 'auth_error';
  }

  if (status === 400 || status === 422) {
    return 'validation_error';
  }

  return 'non_retriable';
}

export function shouldRetry(
  classification: ErrorClassification,
  policy: RetryPolicy,
  attemptIndex: number,
): boolean {
  if (classification === 'rate_limited') return false;
  if (classification === 'auth_error') return false;
  if (classification === 'validation_error') return false;
  if (classification === 'non_retriable') return false;

  if (classification === 'retriable_5xx') {
    return policy.retry_on_5xx && attemptIndex < 1;
  }

  if (classification === 'retriable_network') {
    return policy.retry_on_network && attemptIndex < policy.max_retries;
  }

  return false;
}

export function getBackoffMs(
  policy: RetryPolicy,
  attemptIndex: number,
): number {
  return policy.backoff_ms[attemptIndex] ?? policy.backoff_ms[policy.backoff_ms.length - 1] ?? 1800;
}
