/**
 * Per-handler unit tests for daily_briefing.
 * 8 scenarios per D4/F-217 spec.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DailyBriefingInput } from '../../../src/lib/llm-router.types.js';

const VALID_OUTPUT = {
  headline: '3 pursuits need attention — CMMI expiry in 69 days',
  priority_actions: [
    { action: 'Review ASC logistics proposal draft', urgency: 'today' as const, related_entity: 'SAM-W912PM-26-R-0042' },
  ],
  risk_flags: ['CMMI-DEV ML3 expires 2026-08-07'],
  market_intel_summary: 'Army FY26 logistics modernization spending up 12%.',
  cert_expiration_warnings: ['CMMI-DEV ML3 — 69 days remaining'],
};

const INVALID_OUTPUT = { headline: 42 };

const INPUT: DailyBriefingInput = {
  date: '2026-05-30',
  open_opportunities: [{
    opportunity_id: 'SAM-W912PM-26-R-0042',
    title: 'Army Sustainment Support',
    solicitation_number: 'W912PM-26-R-0042',
    response_deadline: '2026-07-15',
    grade: 'A',
    pwin: 68,
    days_until_deadline: 46,
  }],
  captures_with_gaps: [],
  action_items_due: [],
  sentinel_status: { overall_health: 'healthy', active_alerts: [], last_check_at: '2026-05-30T11:00:00Z' },
  pending_recommendations: [],
  pipeline_at_risk: [],
  expiring_certs: [{ cert_name: 'CMMI-DEV ML3', expiration_date: '2026-08-07', days_remaining: 69, severity: 'critical' }],
};

const mockChat = vi.fn();
vi.mock('../../../src/lib/router/providers/anthropic.js', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

function chatResponse(content: unknown) {
  return { content: JSON.stringify(content), tokens_in: 150, tokens_out: 200, model: 'claude-sonnet-4-5' };
}

describe('daily_briefing handler', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env['MOCK_LLM']; });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('1. success path with valid LLM response', async () => {
    mockChat.mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'daily_briefing', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toMatchObject({ headline: VALID_OUTPUT.headline });
  });

  it('2. schema validation failure → re-prompt with error → success', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'daily_briefing', input: INPUT });
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
    const result = await route({ task: 'daily_briefing', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_kind).toBe('VALIDATION_ERROR');
  });

  it('4. timeout — provider exceeds budget → error', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'daily_briefing', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it('5. fallback fires when primary fails with 429 and budget >= 500ms', async () => {
    let callCount = 0;
    mockChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw Object.assign(new Error('Rate limited'), { status: 429 });
      return Promise.resolve({ content: JSON.stringify(VALID_OUTPUT), tokens_in: 100, tokens_out: 50, model: 'claude-haiku-4-5' });
    });
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'daily_briefing', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fallback_used).toBe(true);
    expect(mockChat.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('6. fallback skipped when remaining budget < 500ms', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'daily_briefing', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
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
    const promise = route({ task: 'daily_briefing', input: INPUT, opts: { timeout_ms: 30_000 } });
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(500);
    await promise;
    // 4 primary calls (1 + 3 retries) + 1 fallback = 5
    expect(mockChat.mock.calls.length).toBe(5);
    const gaps = timestamps.slice(1, 4).map((t, i) => t - timestamps[i]!);
    expect(gaps[0]).toBeGreaterThanOrEqual(200);
    expect(gaps[1]).toBeGreaterThanOrEqual(600);
    expect(gaps[2]).toBeGreaterThanOrEqual(1800);
  });

  it('8. retry suppressed when disable_router_retry: true', async () => {
    mockChat.mockRejectedValue(Object.assign(new Error('network'), { code: 'ECONNRESET' }));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'daily_briefing', input: INPUT, opts: { disable_router_retry: true } });
    expect(result.ok).toBe(false);
    // 1 primary (no retry) + 1 fallback attempt = 2
    expect(mockChat).toHaveBeenCalledTimes(2);
  });
});
