/**
 * Per-handler unit tests for opportunity_analysis.
 * 8 scenarios: success, re-prompt→success, re-prompt→502, timeout (R2: 10s),
 * fallback fires, fallback skipped, retry backoff, retry disabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpportunityAnalysisInput } from '../../../src/lib/llm-router.types.js';

const VALID_OUTPUT = {
  pwin: 68,
  pwin_rationale: 'Strong alignment with Envision logistics capabilities.',
  incumbent_analysis: 'BAE Systems holds current contract W912PM-21-D-0045.',
  competitor_landscape: 'SAIC and Engility expected to bid.',
  blackhat_assessment: 'BAE has incumbency advantage but weak on SDB.',
  wargame_summary: 'Position on SDB set-aside and RS3 vehicle access.',
  timeline_analysis: 'Response due in 46 days — adequate for capture.',
  strengths: ['NAICS alignment', 'SDB certification', 'RS3 vehicle'],
  weaknesses: ['No current ASC work'],
  recommended_teaming: ['Riverstone Solutions'],
  doctrine_alignment_score: 85,
};

const INVALID_OUTPUT = { pwin: 'not-a-number' };

const INPUT: OpportunityAnalysisInput = {
  opportunity_id: 'SAM-W912PM-26-R-0042',
  title: 'Army Sustainment Command Logistics Support',
  description: 'Comprehensive logistics sustainment services.',
  solicitation_number: 'W912PM-26-R-0042',
  naics_codes: ['541330'],
  set_aside: 'SDB',
  place_of_performance: 'Fort Gregg-Adams, VA',
  response_deadline: '2026-07-15',
  incumbent_info: 'BAE Systems',
  sources: [
    { kind: 'sam_gov', title: 'SAM.gov Listing', url: 'https://sam.gov/opp/abc', retrieved_at: '2026-05-30T12:00:00Z' },
  ],
};

const mockChat = vi.fn();
vi.mock('../../../src/lib/router/providers/anthropic.js', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

function chatResponse(content: unknown) {
  return {
    content: JSON.stringify(content),
    tokens_in: 200,
    tokens_out: 300,
    model: 'claude-sonnet-4-5',
  };
}

describe('opportunity_analysis handler', () => {
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
    const result = await route({ task: 'opportunity_analysis', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toMatchObject({ pwin: 68 });
      expect(result.model_used).toBe('claude-sonnet-4-5');
    }
  });

  it('2. schema validation failure → re-prompt with error → success', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'opportunity_analysis', input: INPUT });
    expect(result.ok).toBe(true);
    expect(mockChat).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockChat.mock.calls[1]![0];
    const messages = secondCallArgs.messages;
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content).toContain('schema validation');
  });

  it('3. schema validation failure → re-prompt → still invalid → 502', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'opportunity_analysis', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_kind).toBe('VALIDATION_ERROR');
    }
  });

  it('4. timeout — R2 10s wall-clock → 503 ANALYSIS_TIMEOUT', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'opportunity_analysis', input: INPUT });
    await vi.advanceTimersByTimeAsync(11_000);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_kind).toBe('ANALYSIS_TIMEOUT');
    }
  });

  it('5. fallback fires when primary fails with 429 and budget >= 500ms', async () => {
    let callCount = 0;
    mockChat.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // 429 triggers immediate fallback (no retry)
        throw Object.assign(new Error('Rate limited'), { status: 429 });
      }
      return Promise.resolve({
        content: JSON.stringify(VALID_OUTPUT),
        tokens_in: 100,
        tokens_out: 50,
        model: 'claude-haiku-4-5',
      });
    });
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'opportunity_analysis', input: INPUT });
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
    // Very tight timeout — no room for fallback
    const promise = route({ task: 'opportunity_analysis', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
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
    const promise = route({ task: 'opportunity_analysis', input: INPUT, opts: { timeout_ms: 30_000 } });
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }
    await promise;
    // 4 primary calls (1 + 3 retries) + 1 fallback = 5
    expect(mockChat.mock.calls.length).toBe(5);
    // Check backoff between first 4 calls (primary retries)
    const gaps = timestamps.slice(1, 4).map((t, i) => t - timestamps[i]!);
    expect(gaps[0]).toBeGreaterThanOrEqual(200);
    expect(gaps[1]).toBeGreaterThanOrEqual(600);
    expect(gaps[2]).toBeGreaterThanOrEqual(1800);
  });

  it('8. retry suppressed when disable_router_retry: true', async () => {
    mockChat.mockRejectedValue(Object.assign(new Error('network'), { code: 'ECONNRESET' }));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({
      task: 'opportunity_analysis',
      input: INPUT,
      opts: { disable_router_retry: true },
    });
    expect(result.ok).toBe(false);
    // 1 primary (no retry) + 1 fallback attempt = 2
    expect(mockChat).toHaveBeenCalledTimes(2);
  });
});
