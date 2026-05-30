/**
 * Per-handler unit tests for source_research.
 * 8 scenarios per D4/F-217 spec. Provider: Perplexity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SourceResearchInput } from '../../../src/lib/llm-router.types.js';

const VALID_OUTPUT = {
  findings: [
    { title: 'Army FY26 Logistics Brief', url: 'https://asc.army.mil/fy26', snippet: 'ASC logistics modernization.', relevance_score: 0.95 },
  ],
  summary: 'Army logistics modernization efforts accelerating in FY26.',
  sources_consulted: 3,
};

const INVALID_OUTPUT = { findings: 'not-an-array' };

const INPUT: SourceResearchInput = {
  query: 'Army Sustainment Command FY26 logistics',
  context: 'Evaluating market segment for new pursuits',
  max_sources: 5,
};

const mockChat = vi.fn();
vi.mock('../../../src/lib/router/providers/perplexity.js', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

function chatResponse(content: unknown) {
  return { content: JSON.stringify(content), tokens_in: 150, tokens_out: 200, model: 'sonar-pro' };
}

describe('source_research handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['MOCK_LLM'];
    process.env['PERPLEXITY_API_KEY'] = 'test-key';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env['PERPLEXITY_API_KEY'];
  });

  it('1. success path with valid LLM response', async () => {
    mockChat.mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'source_research', input: INPUT });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toMatchObject({ sources_consulted: 3 });
  });

  it('2. schema validation failure → re-prompt with error → success', async () => {
    mockChat
      .mockResolvedValueOnce(chatResponse(INVALID_OUTPUT))
      .mockResolvedValueOnce(chatResponse(VALID_OUTPUT));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'source_research', input: INPUT });
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
    const result = await route({ task: 'source_research', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_kind).toBe('VALIDATION_ERROR');
  });

  it('4. timeout — provider exceeds budget → error', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'source_research', input: INPUT, opts: { timeout_ms: 100 } });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it('5. no fallback configured — primary fails without fallback attempt', async () => {
    mockChat.mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 500 }));
    const { route } = await import('../../../src/lib/llm-router.js');
    const result = await route({ task: 'source_research', input: INPUT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallback_used).toBe(false);
  });

  it('6. no fallback configured — timeout returns error directly', async () => {
    mockChat.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(chatResponse(VALID_OUTPUT)), 60_000)),
    );
    const { route } = await import('../../../src/lib/llm-router.js');
    vi.useFakeTimers();
    const promise = route({ task: 'source_research', input: INPUT, opts: { timeout_ms: 50 } });
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
    const promise = route({ task: 'source_research', input: INPUT, opts: { timeout_ms: 30_000 } });
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
    const result = await route({ task: 'source_research', input: INPUT, opts: { disable_router_retry: true } });
    expect(result.ok).toBe(false);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
