/**
 * Router-level tests — S4-S8 scenarios.
 * These exercise route() directly to test timeout, fallback, retry, and
 * disable_router_retry behaviors that only exist at the router layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Task, TaskInputMap, RouteRequest } from '../../src/lib/llm-router.types.js';
import type { LLMProvider, LLMChatResponse, LLMEmbedResponse } from '../../src/lib/router/providers/types.js';
import { ROUTING_TABLE } from '../../src/lib/llm-router.table.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/llm-mock');

// ---------------------------------------------------------------------------
// Fixture + sample-input helpers
// ---------------------------------------------------------------------------

const FIXTURE_MAP: Record<Task, string> = {
  fast_track_triage: 'fast-track-triage',
  opportunity_analysis: 'opportunity-analysis',
  capture_plan: 'capture-plan',
  daily_briefing: 'daily-briefing',
  sentinel_summary: 'sentinel-summary',
  doctrine_score: 'doctrine-score',
  semantic_embed: 'semantic-embed',
  source_research: 'source-research',
};

function loadFixtureOutput(task: Task): unknown {
  const raw = readFileSync(join(FIXTURE_DIR, `${FIXTURE_MAP[task]}.json`), 'utf-8');
  return (JSON.parse(raw) as { output: unknown }).output;
}

const SAMPLE_INPUTS: Record<Task, unknown> = {
  fast_track_triage: {
    title: 'Test Opp', description: 'Test', naics_codes: ['541330'],
    set_aside: null, place_of_performance: null,
  },
  opportunity_analysis: {
    opportunity_id: 'opp-1', title: 'Test', description: 'Test',
    solicitation_number: null, naics_codes: ['541330'], set_aside: null,
    place_of_performance: null, response_deadline: null,
    incumbent_info: null, sources: [],
  },
  capture_plan: {
    opportunity_id: 'opp-1', title: 'Test', description: 'Test',
    solicitation_number: null, analysis_summary: 'Summary',
    incumbent_info: null, competitor_landscape: null,
    envision_capabilities: [], teaming_partners: [], sources: [],
  },
  daily_briefing: {
    date: '2026-01-01', open_opportunities: [], captures_with_gaps: [],
    action_items_due: [], sentinel_status: {
      overall_health: 'healthy', active_alerts: [], last_check_at: '2026-01-01T00:00:00Z',
    },
    pending_recommendations: [], pipeline_at_risk: [], expiring_certs: [],
  },
  sentinel_summary: {
    alert_type: 'test', component: 'router', details: 'Test alert',
    recent_log_lines: ['line 1'],
  },
  doctrine_score: {
    opportunity_id: 'opp-1', title: 'Test', description: 'Test',
    naics_codes: ['541330'], set_aside: null,
    envision_alignment_context: 'Test context',
  },
  semantic_embed: { text: 'Test embedding text', namespace: 'test' },
  source_research: { query: 'Test query', context: null, max_sources: 5 },
};

function sampleInputFor<T extends Task>(task: T): TaskInputMap[T] {
  return SAMPLE_INPUTS[task] as TaskInputMap[T];
}

// ---------------------------------------------------------------------------
// TransientError — code = 'ECONNRESET' so router classifies as retryable
// ---------------------------------------------------------------------------

class TransientError extends Error {
  code: string;
  constructor(code = 'ECONNRESET') {
    super(`Transient: ${code}`);
    this.name = 'TransientError';
    this.code = code;
  }
}

class ServerError extends Error {
  status: number;
  constructor(status = 500) {
    super(`Server error ${status}`);
    this.name = 'ServerError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Provider mock registry — intercepts getProvider at the module level
// ---------------------------------------------------------------------------

// Per-model mock state
interface MockProviderState {
  chatFn: ReturnType<typeof vi.fn>;
  embedFn: ReturnType<typeof vi.fn>;
}

const providerMocks = new Map<string, MockProviderState>();

function getOrCreateMock(model: string): MockProviderState {
  let state = providerMocks.get(model);
  if (!state) {
    state = {
      chatFn: vi.fn(),
      embedFn: vi.fn(),
    };
    providerMocks.set(model, state);
  }
  return state;
}

// Mock getProvider at module level — returns a provider whose chat/embed
// delegates to the per-model mock for the requested model.
vi.mock('../../src/lib/router/providers/index.js', () => ({
  getProvider: (_providerName: string): LLMProvider => ({
    name: `mock-${_providerName}`,
    chat: (req: { model: string }, signal?: AbortSignal) => {
      const state = getOrCreateMock(req.model);
      return state.chatFn(req, signal);
    },
    embed: (req: { model: string }, signal?: AbortSignal) => {
      const state = getOrCreateMock(req.model);
      return state.embedFn(req, signal);
    },
  }),
}));

// Must import route AFTER vi.mock is declared (hoisting)
const { route } = await import('../../src/lib/llm-router.js');

// ---------------------------------------------------------------------------
// Mock helper functions
// ---------------------------------------------------------------------------

function validChatResponseFor(task: Task, model: string): LLMChatResponse {
  return {
    text: JSON.stringify(loadFixtureOutput(task)),
    tokens_in: 100,
    tokens_out: 200,
    model,
  };
}

function validEmbedResponseFor(task: Task, model: string): LLMEmbedResponse {
  const output = loadFixtureOutput(task) as { embedding: number[]; dimensions: number };
  return {
    embedding: output.embedding,
    dimensions: output.dimensions,
    tokens_in: 50,
    model,
  };
}

/** Mock a model to return a valid fixture response. */
function mockModelSuccess(model: string, task: Task) {
  const state = getOrCreateMock(model);
  if (task === 'semantic_embed') {
    state.embedFn.mockImplementation(() => Promise.resolve(validEmbedResponseFor(task, model)));
  } else {
    state.chatFn.mockImplementation(() => Promise.resolve(validChatResponseFor(task, model)));
  }
  return state;
}

/** Mock a model to throw a given error on every call. */
function mockModelThrow(model: string, error: Error) {
  const state = getOrCreateMock(model);
  state.chatFn.mockImplementation(() => Promise.reject(error));
  state.embedFn.mockImplementation(() => Promise.reject(error));
  return state;
}

/** Create an AbortError with the code string that classifyError recognises. */
function makeAbortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  (err as NodeJS.ErrnoException).code = 'ABORT_ERR';
  return err;
}

/** Mock a model to hang forever, rejecting on signal abort. */
function mockModelHang(model: string) {
  const state = getOrCreateMock(model);
  const hangImpl = (_req: unknown, signal?: AbortSignal) => {
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(makeAbortError());
      }, { once: true });
    });
  };
  state.chatFn.mockImplementation(hangImpl);
  state.embedFn.mockImplementation(hangImpl);
  return state;
}

/** Mock a model to follow a sequence of steps (throw/return). */
function mockModelSequence(model: string, task: Task, steps: Array<{ throw?: Error } | { return: true }>) {
  const state = getOrCreateMock(model);
  let callIndex = 0;
  const impl = () => {
    const step = steps[callIndex] ?? steps[steps.length - 1]!;
    callIndex++;
    if ('throw' in step && step.throw) {
      return Promise.reject(step.throw);
    }
    if (task === 'semantic_embed') {
      return Promise.resolve(validEmbedResponseFor(task, model));
    }
    return Promise.resolve(validChatResponseFor(task, model));
  };
  state.chatFn.mockImplementation(impl);
  state.embedFn.mockImplementation(impl);
  return state;
}

/** Mock a model to delay then throw (simulates slow failure). */
function mockModelDelayedThrow(model: string, delayMs: number, error: Error) {
  const state = getOrCreateMock(model);
  const impl = () => new Promise((_resolve, reject) => {
    setTimeout(() => reject(error), delayMs);
  });
  state.chatFn.mockImplementation(impl);
  state.embedFn.mockImplementation(impl);
  return state;
}

// ---------------------------------------------------------------------------
// Derived task lists
// ---------------------------------------------------------------------------

const ALL_TASKS: Task[] = [
  'fast_track_triage', 'opportunity_analysis', 'capture_plan',
  'daily_briefing', 'sentinel_summary', 'doctrine_score',
  'semantic_embed', 'source_research',
];

const TASKS_WITH_FALLBACK = ALL_TASKS.filter(
  (t) => ROUTING_TABLE.find((r) => r.task === t)?.fallback != null,
);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('llm-router — wall-clock + fallback + retry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    providerMocks.clear();
    // Force real-mode so mock fixtures don't short-circuit route()
    delete process.env.LLM_ROUTER_MODE;
    // Set dummy API keys so validateKeys() doesn't throw
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.PERPLEXITY_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
  });

  // =========================================================================
  // S4 — Timeout
  // =========================================================================
  describe('S4 — timeout', () => {
    it('opportunity_analysis: returns ANALYSIS_TIMEOUT when wall-clock exceeded', async () => {
      const entry = ROUTING_TABLE.find((r) => r.task === 'opportunity_analysis')!;
      mockModelHang(entry.model);
      if (entry.fallback) mockModelHang(entry.fallback.model);

      const p = route({
        task: 'opportunity_analysis',
        input: sampleInputFor('opportunity_analysis'),
        opts: { mock: false },
      });
      await vi.advanceTimersByTimeAsync(entry.timeout_ms + 100);
      const result = await p;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_kind).toBe('ANALYSIS_TIMEOUT');
      }
    });

    it.each(ALL_TASKS.filter((t) => t !== 'opportunity_analysis'))(
      '%s: returns error when wall-clock exceeded',
      async (task) => {
        const entry = ROUTING_TABLE.find((r) => r.task === task)!;
        mockModelHang(entry.model);
        if (entry.fallback) mockModelHang(entry.fallback.model);

        const p = route({ task, input: sampleInputFor(task), opts: { mock: false } });
        await vi.advanceTimersByTimeAsync(entry.timeout_ms + 100);
        const result = await p;

        expect(result.ok).toBe(false);
        if (!result.ok) {
          // Non-opp_analysis tasks still get ANALYSIS_TIMEOUT via ABORT_ERR classification
          expect(result.error_kind).toBe('ANALYSIS_TIMEOUT');
        }
      },
    );
  });

  // =========================================================================
  // S5 — Fallback fires when primary fails and budget remains
  // =========================================================================
  describe('S5 — fallback fires when primary fails and budget remains', () => {
    it.each(TASKS_WITH_FALLBACK)(
      '%s: primary throws 500 fast → fallback returns valid output → ok:true',
      async (task) => {
        const entry = ROUTING_TABLE.find((r) => r.task === task)!;
        // Primary throws a 500 immediately (fallback trigger + retryable on 5xx)
        // Set max_retries to 0 via disable_router_retry to avoid retry delays
        mockModelThrow(entry.model, new ServerError(500));
        mockModelSuccess(entry.fallback!.model, task);

        const p = route({
          task,
          input: sampleInputFor(task),
          opts: { disable_router_retry: true, mock: false },
        });
        // Small tick to resolve promises
        await vi.advanceTimersByTimeAsync(50);
        const result = await p;

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.model_used).toBe(entry.fallback!.model);
          expect(result.fallback_used).toBe(true);
        }
      },
    );
  });

  // =========================================================================
  // S6 — Fallback SKIPPED when remaining budget < min_remaining_budget_ms
  // =========================================================================
  describe('S6 — fallback skipped when budget < min_remaining_budget_ms', () => {
    it.each(TASKS_WITH_FALLBACK)(
      '%s: primary fails late → remaining < 500ms → fallback not called → ok:false',
      async (task) => {
        const entry = ROUTING_TABLE.find((r) => r.task === task)!;
        const minBudget = entry.fallback!.min_remaining_budget_ms ?? 500;
        // Primary takes most of the budget then throws 500
        const delay = entry.timeout_ms - minBudget + 100;
        mockModelDelayedThrow(entry.model, delay, new ServerError(500));
        const fallbackState = mockModelSuccess(entry.fallback!.model, task);

        const p = route({
          task,
          input: sampleInputFor(task),
          opts: { disable_router_retry: true, mock: false },
        });
        // Advance past the delayed throw
        await vi.advanceTimersByTimeAsync(delay + 50);
        const result = await p;

        expect(result.ok).toBe(false);
        // Fallback provider should never have been called
        expect(fallbackState.chatFn).not.toHaveBeenCalled();
        expect(fallbackState.embedFn).not.toHaveBeenCalled();
      },
    );
  });

  // =========================================================================
  // S7 — Retry honors 200ms / 600ms / 1800ms backoff
  // =========================================================================
  describe('S7 — retry backoff timing', () => {
    it('honors 200ms / 600ms / 1800ms backoff between retries', async () => {
      const task: Task = 'doctrine_score';
      const entry = ROUTING_TABLE.find((r) => r.task === task)!;

      const state = mockModelSequence(entry.model, task, [
        { throw: new TransientError('ECONNRESET') },
        { throw: new TransientError('ECONNRESET') },
        { throw: new TransientError('ECONNRESET') },
        { return: true },
      ]);

      const p = route({ task, input: sampleInputFor(task), opts: { mock: false } });

      // After initial call (synchronous): 1 call
      await vi.advanceTimersByTimeAsync(1);
      expect(state.chatFn).toHaveBeenCalledTimes(1);

      // Advance 200ms backoff → retry 1
      await vi.advanceTimersByTimeAsync(200);
      expect(state.chatFn).toHaveBeenCalledTimes(2);

      // Advance 600ms backoff → retry 2
      await vi.advanceTimersByTimeAsync(600);
      expect(state.chatFn).toHaveBeenCalledTimes(3);

      // Advance 1800ms backoff → retry 3 (success)
      await vi.advanceTimersByTimeAsync(1800);
      expect(state.chatFn).toHaveBeenCalledTimes(4);

      const result = await p;
      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // S8 — disable_router_retry suppresses retries
  // =========================================================================
  describe('S8 — disable_router_retry: true suppresses retries', () => {
    it.each(ALL_TASKS)(
      '%s: with disable_router_retry → provider called exactly once on transient error',
      async (task) => {
        const entry = ROUTING_TABLE.find((r) => r.task === task)!;
        const state = mockModelThrow(entry.model, new TransientError('ECONNRESET'));
        // For tasks with fallback, also mock fallback to throw so we can verify
        if (entry.fallback) {
          mockModelThrow(entry.fallback.model, new TransientError('ECONNRESET'));
        }

        const p = route({
          task,
          input: sampleInputFor(task),
          opts: { disable_router_retry: true, mock: false },
        });
        await vi.advanceTimersByTimeAsync(100);
        const result = await p;

        expect(result.ok).toBe(false);
        // Primary provider called exactly once (no retries)
        expect(state.chatFn.mock.calls.length + state.embedFn.mock.calls.length).toBe(1);
      },
    );
  });
});
