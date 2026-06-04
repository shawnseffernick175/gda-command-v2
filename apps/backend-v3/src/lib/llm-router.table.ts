/**
 * LLM Router — Routing Table
 *
 * One entry per Task. CI enforces parity with the Task union.
 * Model versions are pins, not "latest" — bumping a model is an explicit PR.
 */

import type { Task, Provider, RoutingTableEntry, FallbackConfig } from './llm-router.types.js';

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
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'capture_plan',
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    timeout_ms: 60_000,
    fallback: { provider: 'anthropic', model: 'claude-sonnet-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'daily_briefing',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 90_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
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

/** Lookup helper — O(1) via pre-built map. */
const TABLE_MAP = new Map<Task, RoutingTableEntry>(
  ROUTING_TABLE.map((entry) => [entry.task, entry])
);

export function getRoutingEntry(task: Task): RoutingTableEntry {
  const entry = TABLE_MAP.get(task);
  if (!entry) {
    throw new Error(`No routing entry for task: ${task}`);
  }
  return entry;
}

/**
 * Build-time assertion: exactly one entry per Task union member.
 * Called in CI test to enforce parity.
 */
export function assertRoutingTableComplete(allTasks: readonly Task[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tableTasks = new Set(ROUTING_TABLE.map((e) => e.task));

  for (const task of allTasks) {
    if (!tableTasks.has(task)) {
      errors.push(`Missing routing entry for task: ${task}`);
    }
  }

  for (const entry of ROUTING_TABLE) {
    const count = ROUTING_TABLE.filter((e) => e.task === entry.task).length;
    if (count > 1) {
      errors.push(`Duplicate routing entry for task: ${entry.task}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
