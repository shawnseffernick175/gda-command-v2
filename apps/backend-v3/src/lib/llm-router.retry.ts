/**
 * Retry + backoff logic per D4 §7.
 */

import type { RetryPolicy } from './llm-router.types.js';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_retries: 3,
  backoff_ms: [200, 600, 1800],
  retry_on_5xx: true,
  retry_on_network: true,
  retry_on_429: false,
};

export interface RetryableError {
  status?: number;
  code?: string;
  message?: string;
}

export function isRetryable(err: RetryableError, policy: RetryPolicy): boolean {
  const status = err.status ?? extractStatusFromCode(err.code);

  if (status === 429) return policy.retry_on_429;
  if (status !== undefined && status >= 500 && status < 600) return policy.retry_on_5xx;

  if (isNetworkError(err)) return policy.retry_on_network;

  return false;
}

export function isFallbackTrigger(err: RetryableError): boolean {
  const status = err.status ?? extractStatusFromCode(err.code);
  if (status === 429) return true;
  if (status !== undefined && status >= 500 && status < 600) return true;
  return false;
}

export function is429(err: RetryableError): boolean {
  const status = err.status ?? extractStatusFromCode(err.code);
  return status === 429;
}

function isNetworkError(err: RetryableError): boolean {
  const code = err.code ?? '';
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code);
}

export function extractStatusFromCode(code: string | undefined): number | undefined {
  if (!code) return undefined;
  const match = /^HTTP_(\d+)$/.exec(code);
  return match ? parseInt(match[1]!, 10) : undefined;
}

export function getBackoffMs(attempt: number, policy: RetryPolicy): number {
  if (attempt >= policy.backoff_ms.length) {
    return policy.backoff_ms[policy.backoff_ms.length - 1]!;
  }
  return policy.backoff_ms[attempt]!;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
