/**
 * Unit tests for retry + backoff logic.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETRY,
  classifyError,
  shouldRetry,
  getBackoffMs,
} from '../../src/lib/llm-router.retry.js';

describe('Retry Logic', () => {
  describe('classifyError', () => {
    it('classifies ECONNRESET as retriable_network', () => {
      expect(classifyError({ code: 'ECONNRESET', message: '' })).toBe('retriable_network');
    });

    it('classifies ENOTFOUND as retriable_network', () => {
      expect(classifyError({ code: 'ENOTFOUND', message: '' })).toBe('retriable_network');
    });

    it('classifies ETIMEDOUT as retriable_network', () => {
      expect(classifyError({ code: 'ETIMEDOUT', message: '' })).toBe('retriable_network');
    });

    it('classifies 429 as rate_limited', () => {
      expect(classifyError({ status: 429, message: '' })).toBe('rate_limited');
    });

    it('classifies code "429" as rate_limited', () => {
      expect(classifyError({ code: '429', message: '' })).toBe('rate_limited');
    });

    it('classifies 500 as retriable_5xx', () => {
      expect(classifyError({ status: 500, message: '' })).toBe('retriable_5xx');
    });

    it('classifies 503 as retriable_5xx', () => {
      expect(classifyError({ status: 503, message: '' })).toBe('retriable_5xx');
    });

    it('classifies 401 as auth_error', () => {
      expect(classifyError({ status: 401, message: '' })).toBe('auth_error');
    });

    it('classifies 400 as validation_error', () => {
      expect(classifyError({ status: 400, message: '' })).toBe('validation_error');
    });

    it('classifies unknown errors as non_retriable', () => {
      expect(classifyError({ message: 'something weird' })).toBe('non_retriable');
    });

    it('classifies fetch failed as retriable_network', () => {
      expect(classifyError({ message: 'fetch failed' })).toBe('retriable_network');
    });
  });

  describe('shouldRetry', () => {
    it('retries network errors up to max_retries', () => {
      expect(shouldRetry('retriable_network', DEFAULT_RETRY, 0)).toBe(true);
      expect(shouldRetry('retriable_network', DEFAULT_RETRY, 1)).toBe(true);
      expect(shouldRetry('retriable_network', DEFAULT_RETRY, 2)).toBe(true);
      expect(shouldRetry('retriable_network', DEFAULT_RETRY, 3)).toBe(false);
    });

    it('retries 5xx errors once only', () => {
      expect(shouldRetry('retriable_5xx', DEFAULT_RETRY, 0)).toBe(true);
      expect(shouldRetry('retriable_5xx', DEFAULT_RETRY, 1)).toBe(false);
    });

    it('never retries rate_limited (immediate fallback)', () => {
      expect(shouldRetry('rate_limited', DEFAULT_RETRY, 0)).toBe(false);
    });

    it('never retries auth_error', () => {
      expect(shouldRetry('auth_error', DEFAULT_RETRY, 0)).toBe(false);
    });

    it('never retries validation_error', () => {
      expect(shouldRetry('validation_error', DEFAULT_RETRY, 0)).toBe(false);
    });
  });

  describe('getBackoffMs', () => {
    it('returns 200ms for first retry', () => {
      expect(getBackoffMs(DEFAULT_RETRY, 0)).toBe(200);
    });

    it('returns 600ms for second retry', () => {
      expect(getBackoffMs(DEFAULT_RETRY, 1)).toBe(600);
    });

    it('returns 1800ms for third retry', () => {
      expect(getBackoffMs(DEFAULT_RETRY, 2)).toBe(1800);
    });

    it('returns last backoff for out-of-bounds index', () => {
      expect(getBackoffMs(DEFAULT_RETRY, 10)).toBe(1800);
    });
  });

  describe('DEFAULT_RETRY policy', () => {
    it('has 3 max retries', () => {
      expect(DEFAULT_RETRY.max_retries).toBe(3);
    });

    it('has exponential backoff schedule [200, 600, 1800]', () => {
      expect([...DEFAULT_RETRY.backoff_ms]).toEqual([200, 600, 1800]);
    });

    it('retries on 5xx', () => {
      expect(DEFAULT_RETRY.retry_on_5xx).toBe(true);
    });

    it('retries on network errors', () => {
      expect(DEFAULT_RETRY.retry_on_network).toBe(true);
    });

    it('does NOT retry on 429', () => {
      expect(DEFAULT_RETRY.retry_on_429).toBe(false);
    });
  });
});
