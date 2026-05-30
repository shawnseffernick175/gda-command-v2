/**
 * Per-handler unit tests for capture_plan.
 * 8 scenarios per D4/F-217 spec.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CapturePlanInput } from '../../../src/lib/llm-router.types.js';

const VALID_OUTPUT = {
  capture_plan: {
    customer_profile: 'Army Sustainment Command (ASC)',
    requirements_summary: 'Logistics sustainment services for Army installations.',
    solution_strategy: 'Leverage existing RS3 vehicle and SDB status.',
    win_themes: [{ theme: 'SDB Advantage', evidence: ['Certified SDB'], customer_hot_button: 'Small business goals' }],
    ghost_themes: [{ target_competitor: 'BAE Systems', theme: 'Incumbency complacency', rationale: 'BAE underperforms on metrics' }],
    discriminators: ['ISO 9001:2015', 'CMMI-DEV ML3'],
    pricing_strategy: 'Competitive price-to-win aligned with DCAA rates.',
    teaming_plan: {
      partners: [{
        name: 'Riverstone Solutions',
        role: 'sub' as const,
        contribution: 'Supply chain analytics',
        certs_leveraged: ['CMMC ML2'],
        vehicles_leveraged: ['OASIS SB'],
      }],
      rationale: 'Complement logistics with analytics capability.',
      teaming_arrangement: 'prime_sub' as const,
    },
  },
  pink_hat_gaps: [{ gap: 'Missing past performance on ASC', section: 'Volume II', severity: 'significant' as const, recommended_fix: 'Add Riverstone reference' }],
  red_team_weaknesses: [{ weakness: 'No incumbency', likelihood: 'High' as const, mitigation: 'Emphasize SDB and fresh approach' }],
  gold_team_readiness: { ready: false, items: [{ item: 'Executive summary', status: 'incomplete' as const, notes: 'Draft in progress' }] },
  black_hat_competitor_positioning: [{ competitor: 'BAE Systems', likely_approach: 'Incumbency lock', strengths_vs_us: ['Current work'], weaknesses_vs_us: ['Large business'], counter_strategy: 'SDB set-aside disqualifies' }],
  next_action: { action: 'Complete Pink Team draft', owner: 'Capture Lead', deadline: '2026-06-15', priority: 'high' as const },
  source_chips: [{ label: 'SAM.gov', url: 'https://sam.gov/opp/abc', kind: 'sam_gov' as const, retrieved_at: '2026-05-30T12:00:00Z' }],
  generated_at: '2026-05-30T16:00:00Z',
  model_used: 'claude-opus-4-5',
  is_partial: false,
};

const INVALID_OUTPUT = { capture_plan: null };

const INPUT: CapturePlanInput = {
  opportunity_id: 'SAM-W912PM-26-R-0042',
  title: 'Army Sustainment Support',
  description: 'Logistics sustainment services.',
  solicitation_number: 'W912PM-26-R-0042',
  analysis_summary: 'Pwin 68%.',
  incumbent_info: 'BAE Systems',
  competitor_landscape: 'BAE, SAIC',
  envision_capabilities: ['logistics', 'sustainment'],
  teaming_partners: ['Riverstone Solutions'],
  sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/abc', retrieved_at: '2026-05-30T12:00:00Z' }],
};

const mockChat = vi.fn();
vi.mock('../../../src/lib/router/providers/anthropic.js', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

function chatResponse(content: unknown, model = 'claude-opus-4-5') {
  return { content: JSON.stringify(content), tokens_in: 300, tokens_out: 500, model };
}

describe('capture_plan handler', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env['MOCK_LLM']; });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('1. success path with valid LLM response', async () => {
    mockChat.mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'capture_plan', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toMatchObject({ is_partial: false });
  });

  it('2. schema validation failure → re-prompt with error → success', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'capture_plan', input: INPUT });
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
    const result = await route({ task: 'capture_plan', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_kind).toBe('VALIDATION_ERROR');
  });

  it('4. timeout — provider exceeds budget → error', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'capture_plan', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it('5. fallback fires when primary fails with 429 and budget >= 500ms', async () => {
    let callCount = 0;
    mockChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw Object.assign(new Error('Rate limited'), { status: 429 });
      return Promise.resolve(chatResponse(VALID_OUTPUT, 'claude-sonnet-4-5'));
    });
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'capture_plan', input: INPUT });
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
    const promise = route({ task: 'capture_plan', input: INPUT, opts: { timeout_ms: 100 } });
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
    const promise = route({ task: 'capture_plan', input: INPUT, opts: { timeout_ms: 30_000 } });
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
    const result = await route({ task: 'capture_plan', input: INPUT, opts: { disable_router_retry: true } });
    expect(result.ok).toBe(false);
    // 1 primary (no retry) + 1 fallback attempt = 2
    expect(mockChat).toHaveBeenCalledTimes(2);
  });
});
