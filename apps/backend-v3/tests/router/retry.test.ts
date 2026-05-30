/**
 * Retry policy tests.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETRY_POLICY,
  isRetryable,
  isFallbackTrigger,
  is429,
  getBackoffMs,
} from '../../src/lib/llm-router.retry.js';

describe('[Retry] DEFAULT_RETRY_POLICY', () => {
  it('has 3 max retries', () => {
    expect(DEFAULT_RETRY_POLICY.max_retries).toBe(3);
  });

  it('has 200/600/1800ms backoff schedule', () => {
    expect([...DEFAULT_RETRY_POLICY.backoff_ms]).toEqual([200, 600, 1800]);
  });

  it('retries on 5xx', () => {
    expect(DEFAULT_RETRY_POLICY.retry_on_5xx).toBe(true);
  });

  it('retries on network errors', () => {
    expect(DEFAULT_RETRY_POLICY.retry_on_network).toBe(true);
  });

  it('does NOT retry on 429', () => {
    expect(DEFAULT_RETRY_POLICY.retry_on_429).toBe(false);
  });
});

describe('[Retry] isRetryable', () => {
  it('returns true for 500 when retry_on_5xx is true', () => {
    expect(isRetryable({ status: 500 }, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('returns true for 502 when retry_on_5xx is true', () => {
    expect(isRetryable({ status: 502 }, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('returns false for 429 with default policy', () => {
    expect(isRetryable({ status: 429 }, DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('returns false for 401', () => {
    expect(isRetryable({ status: 401 }, DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('returns false for 400', () => {
    expect(isRetryable({ status: 400 }, DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('returns true for ECONNRESET', () => {
    expect(isRetryable({ code: 'ECONNRESET' }, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('returns true for ETIMEDOUT', () => {
    expect(isRetryable({ code: 'ETIMEDOUT' }, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('recognizes HTTP_ code prefix', () => {
    expect(isRetryable({ code: 'HTTP_500' }, DEFAULT_RETRY_POLICY)).toBe(true);
    expect(isRetryable({ code: 'HTTP_429' }, DEFAULT_RETRY_POLICY)).toBe(false);
  });
});

describe('[Retry] isFallbackTrigger', () => {
  it('triggers on 429', () => {
    expect(isFallbackTrigger({ status: 429 })).toBe(true);
  });

  it('triggers on 500', () => {
    expect(isFallbackTrigger({ status: 500 })).toBe(true);
  });

  it('does not trigger on 401', () => {
    expect(isFallbackTrigger({ status: 401 })).toBe(false);
  });
});

describe('[Retry] is429', () => {
  it('detects 429 status', () => {
    expect(is429({ status: 429 })).toBe(true);
  });

  it('detects HTTP_429 code', () => {
    expect(is429({ code: 'HTTP_429' })).toBe(true);
  });

  it('returns false for other statuses', () => {
    expect(is429({ status: 500 })).toBe(false);
  });
});

describe('[Retry] getBackoffMs', () => {
  it('returns correct backoff for each attempt', () => {
    expect(getBackoffMs(0, DEFAULT_RETRY_POLICY)).toBe(200);
    expect(getBackoffMs(1, DEFAULT_RETRY_POLICY)).toBe(600);
    expect(getBackoffMs(2, DEFAULT_RETRY_POLICY)).toBe(1800);
  });

  it('returns last value for out-of-range attempt', () => {
    expect(getBackoffMs(5, DEFAULT_RETRY_POLICY)).toBe(1800);
  });
});
