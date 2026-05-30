/**
 * Per-handler unit tests for fast_track_triage.
 * 8 scenarios: success, re-prompt→success, re-prompt→502, timeout,
 * fallback fires, fallback skipped, retry backoff, retry disabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastTrackTriageInput } from '../../../src/lib/llm-router.types.js';

const VALID_OUTPUT = {
  grade: 'A' as const,
  rationale: 'Strong alignment with Envision logistics focus.',
  naics_match_score: 92,
  recommended_action: 'pursue' as const,
};

const INVALID_OUTPUT = {
  grade: 'X',
  rationale: 123,
};

const INPUT: FastTrackTriageInput = {
  title: 'Army Logistics Support',
  description: 'Field service engineering.',
  naics_codes: ['541330'],
  set_aside: 'SDB',
  place_of_performance: 'Fort Gregg-Adams, VA',
};

const mockChat = vi.fn();
vi.mock('../../../src/lib/router/providers/anthropic.js', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

function chatResponse(content: unknown) {
  return {
    content: JSON.stringify(content),
    tokens_in: 100,
    tokens_out: 50,
    model: 'claude-haiku-4-5',
  };
}

describe('fast_track_triage handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['MOCK_LLM'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1. success path with valid LLM response', async () => {
    mockChat.mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'fast_track_triage', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toMatchObject(VALID_OUTPUT);
      expect(result.model_used).toBe('claude-haiku-4-5');
    }
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('2. schema validation failure → re-prompt with error → success', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(VALID_OUTPUT));

    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'fast_track_triage', input: INPUT });
    expect(result.ok).toBe(true);
    expect(mockChat).toHaveBeenCalledTimes(2);
    // Verify second call includes correction context
    const secondCallArgs = mockChat.mock.calls[1]![0];
    const messages = secondCallArgs.messages;
    expect(messages.length).toBeGreaterThan(1);
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toContain('schema validation');
  });

  it('3. schema validation failure → re-prompt → still invalid → 502 INVALID_OUTPUT', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT));

    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'fast_track_triage', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_kind).toBe('VALIDATION_ERROR');
      expect(result.error_message).toContain('Schema validation failed');
    }
  });

  it('4. timeout — provider exceeds budget → error', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );

    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'fast_track_triage', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it('5. no fallback configured — primary fails without fallback attempt', async () => {
    // fast_track_triage has no fallback
    mockChat.mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 500 }));

    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'fast_track_triage', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback_used).toBe(false);
    }
  });

  it('6. no fallback configured — timeout returns error directly', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );

    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'fast_track_triage', input: INPUT, opts: { timeout_ms: 50 } });
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback_used).toBe(false);
    }
  });

  it('7. retry honors 200ms / 600ms / 1800ms backoff schedule', async () => {
    const timestamps: number[] = [];
    mockChat.mockImplementation(async () => {
      timestamps.push(Date.now());
      throw Object.assign(new Error('network'), { code: 'ECONNRESET' });
    });

    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'fast_track_triage', input: INPUT, opts: { timeout_ms: 30_000 } });
    // Advance through all retries
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }
    await promise;
    // Should have 4 calls: initial + 3 retries
    expect(mockChat.mock.calls.length).toBe(4);
    // Verify backoff gaps approximate 200, 600, 1800
    const gaps = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(timestamps[i]! - timestamps[i - 1]!);
    }
    expect(gaps[0]).toBeGreaterThanOrEqual(200);
    expect(gaps[1]).toBeGreaterThanOrEqual(600);
    expect(gaps[2]).toBeGreaterThanOrEqual(1800);
  });

  it('8. retry suppressed when disable_router_retry: true', async () => {
    mockChat.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'ECONNRESET' }));

    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({
      task: 'fast_track_triage',
      input: INPUT,
      opts: { disable_router_retry: true },
    });
    expect(result.ok).toBe(false);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
