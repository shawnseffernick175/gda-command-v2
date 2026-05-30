/**
 * Per-handler unit tests for sentinel_summary.
 * 8 scenarios per D4/F-217 spec.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SentinelSummaryInput } from '../../../src/lib/llm-router.types.js';

const VALID_OUTPUT = {
  severity: 'warning' as const,
  root_cause: 'GovTribe API returning intermittent 503 errors.',
  recommended_fix: 'Monitor and auto-retry. Switch to backup feed if persists.',
  affected_components: ['govtribe-ingest', 'opportunity-discovery'],
};

const INVALID_OUTPUT = { severity: 'unknown' };

const INPUT: SentinelSummaryInput = {
  alert_type: 'ingest_delay',
  component: 'govtribe-ingest',
  details: 'GovTribe API returning 503.',
  recent_log_lines: ['2026-05-30T10:00:00Z ERROR govtribe fetch failed: 503'],
};

const mockChat = vi.fn();
vi.mock('../../../src/lib/router/providers/anthropic.js', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

function chatResponse(content: unknown) {
  return { content: JSON.stringify(content), tokens_in: 80, tokens_out: 40, model: 'claude-haiku-4-5' };
}

describe('sentinel_summary handler', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env['MOCK_LLM']; });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('1. success path with valid LLM response', async () => {
    mockChat.mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'sentinel_summary', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toMatchObject({ severity: 'warning' });
  });

  it('2. schema validation failure → re-prompt with error → success', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'sentinel_summary', input: INPUT });
    expect(result.ok).toBe(true);
    expect(mockChat).toHaveBeenCalledTimes(2);
    const secondCall = mockChat.mock.calls[1]![0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.content).toContain('schema validation');
  });

  it('3. schema validation failure → re-prompt → still invalid → 502', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'sentinel_summary', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_kind).toBe('VALIDATION_ERROR');
  });

  it('4. timeout — provider exceeds budget → error', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'sentinel_summary', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it('5. no fallback configured — primary fails without fallback attempt', async () => {
    mockChat.mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 500 }));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'sentinel_summary', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallback_used).toBe(false);
  });

  it('6. no fallback configured — timeout returns error directly', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'sentinel_summary', input: INPUT, opts: { timeout_ms: 50 } });
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallback_used).toBe(false);
  });

  it('7. retry honors backoff schedule', async () => {
    const timestamps: number[] = [];
    mockChat.mockImplementation(async () => {
      timestamps.push(Date.now());
      throw Object.assign(new Error('network'), { code: 'ECONNRESET' });
    });
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'sentinel_summary', input: INPUT, opts: { timeout_ms: 30_000 } });
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(500);
    await promise;
    expect(mockChat.mock.calls.length).toBe(4);
    const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]!);
    expect(gaps[0]).toBeGreaterThanOrEqual(200);
    expect(gaps[1]).toBeGreaterThanOrEqual(600);
    expect(gaps[2]).toBeGreaterThanOrEqual(1800);
  });

  it('8. retry suppressed when disable_router_retry: true', async () => {
    mockChat.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'ECONNRESET' }));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'sentinel_summary', input: INPUT, opts: { disable_router_retry: true } });
    expect(result.ok).toBe(false);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
