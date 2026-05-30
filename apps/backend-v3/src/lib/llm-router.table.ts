/**
 * Routing table — maps Task → provider/model/timeout/fallback.
 * Model versions are pins, not "latest." Bumping a model is an explicit PR.
 */

import type { Task, RoutingTableEntry } from './llm-router.types.js';

export const ROUTING_TABLE: readonly RoutingTableEntry[] = [
  {
    task: 'fast_track_triage',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 5_000,
    fallback: null,
  },
  {
    task: 'opportunity_analysis',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 10_000,
    fallback: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      min_remaining_budget_ms: 500,
    },
  },
  {
    task: 'capture_plan',
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    timeout_ms: 60_000,
    fallback: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      min_remaining_budget_ms: 500,
    },
  },
  {
    task: 'daily_briefing',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      min_remaining_budget_ms: 500,
    },
  },
  {
    task: 'sentinel_summary',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 5_000,
    fallback: null,
  },
  {
    task: 'doctrine_score',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 8_000,
    fallback: null,
  },
  {
    task: 'semantic_embed',
    provider: 'openai',
    model: 'text-embedding-3-large',
    timeout_ms: 10_000,
    fallback: null,
  },
  {
    task: 'source_research',
    provider: 'perplexity',
    model: 'sonar-pro',
    timeout_ms: 20_000,
    fallback: null,
  },
] as const;

const TABLE_MAP = new Map<Task, RoutingTableEntry>();
for (const entry of ROUTING_TABLE) {
  TABLE_MAP.set(entry.task, entry);
}

export function getRoutingEntry(task: Task): RoutingTableEntry {
  const entry = TABLE_MAP.get(task);
  if (!entry) {
    throw new Error(`No routing table entry for task: ${task}`);
  }
  return entry;
}
