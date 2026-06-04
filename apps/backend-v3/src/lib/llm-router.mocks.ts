/**
 * LLM Router — Mock Registry for CI
 *
 * MOCK_LLM=1 or opts.mock=true activates this registry.
 * Zero real API calls in CI. Keyed by task + deterministic input hash.
 */

import { createHash } from 'node:crypto';
import type {
  Task,
  MockRegistry,
  RouteResponseOk,
  TaskInputMap,
  FastTrackTriageOutput,
  OpportunityAnalysisOutput,
  CapturePlanOutput,
  DailyBriefingOutput,
  SentinelSummaryOutput,
  DoctrineScoreOutput,
  SemanticEmbedOutput,
  SourceResearchOutput,
} from './llm-router.types.js';

/** Deterministic hash of input for mock lookup. */
export function hashInput(input: unknown): string {
  const json = JSON.stringify(input, Object.keys(input as object).sort());
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

const store = new Map<string, RouteResponseOk<Task>>();

function makeKey(task: Task, inputHash: string): string {
  return `${task}:${inputHash}`;
}

export const mockRegistry: MockRegistry = {
  get<T extends Task>(task: T, inputHash: string): RouteResponseOk<T> | null {
    const key = makeKey(task, inputHash);
    const entry = store.get(key);
    return (entry as RouteResponseOk<T>) ?? null;
  },

  register<T extends Task>(task: T, inputHash: string, response: RouteResponseOk<T>): void {
    const key = makeKey(task, inputHash);
    store.set(key, response as RouteResponseOk<Task>);
  },
};

/** Clear all registered mocks (for test cleanup). */
export function clearMocks(): void {
  store.clear();
}

/** Generate a default mock response for any task. Used as catch-all in CI. */
export function getDefaultMock<T extends Task>(task: T, traceId: string): RouteResponseOk<T> {
  const base = {
    ok: true as const,
    task,
    model_used: 'mock-model',
    latency_ms: 50,
    tokens: { input: 100, output: 50 },
    cost_estimate_usd: 0.0001,
    fallback_used: false,
    quality_flag: 'full' as const,
    trace_id: traceId,
  };

  const outputs: Record<Task, unknown> = {
    fast_track_triage: {
      grade: 'B',
      rationale: 'Mock triage response',
      naics_match_score: 70,
      recommended_action: 'watch',
    } satisfies FastTrackTriageOutput,

    opportunity_analysis: {
      win_probability: 55,
      win_probability_reasoning: 'Mock analysis',
      shipley_bid_no_bid: {
        overall: 'Conditional',
        customer_knowledge: { score: 6, reasoning: 'Mock', evidence: [] },
        solution_match: { score: 7, reasoning: 'Mock', evidence: [] },
        competitive_position: { score: 5, reasoning: 'Mock', evidence: [] },
        past_performance: { score: 6, reasoning: 'Mock', evidence: [] },
      },
      incumbent: null,
      competitive_landscape: [],
      doctrine_alignment: [],
      source_chips: [],
      generated_at: new Date().toISOString(),
      model_used: 'mock-model',
      analysis_version: 'mock-v1',
    } satisfies OpportunityAnalysisOutput,

    capture_plan: {
      capture_plan: {
        customer_profile: 'Mock customer',
        requirements_summary: 'Mock requirements',
        solution_strategy: 'Mock strategy',
        win_themes: [],
        ghost_themes: [],
        discriminators: [],
        pricing_strategy: 'Mock pricing',
        teaming_plan: null,
      },
      pink_hat_gaps: [],
      red_team_weaknesses: [],
      gold_team_readiness: { ready: false, items: [] },
      black_hat_competitor_positioning: [],
      next_action: { action: 'Mock action', owner: 'Mock', deadline: '2026-01-01', priority: 'medium' },
      source_chips: [],
      generated_at: new Date().toISOString(),
      model_used: 'mock-model',
      is_partial: false,
    } satisfies CapturePlanOutput,

    daily_briefing: {
      headline: 'Mock daily briefing',
      priority_actions: [],
      risk_flags: [],
      market_intel_summary: 'Mock intel summary',
      cert_expiration_warnings: [],
    } satisfies DailyBriefingOutput,

    sentinel_summary: {
      severity: 'info',
      root_cause: 'Mock root cause',
      recommended_fix: 'Mock fix',
      affected_components: [],
    } satisfies SentinelSummaryOutput,

    doctrine_score: {
      overall_score: 28,
      principle_scores: [],
      alignment_summary: 'Mock alignment',
      concerns: [],
    } satisfies DoctrineScoreOutput,

    semantic_embed: {
      embedding: new Array(3072).fill(0),
      dimensions: 3072,
    } satisfies SemanticEmbedOutput,

    source_research: {
      findings: [],
      summary: 'Mock research summary',
      sources_consulted: 0,
    } satisfies SourceResearchOutput,
  };

  return {
    ...base,
    output: outputs[task] as RouteResponseOk<T>['output'],
  };
}
