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
    model: 'claude-sonnet-4-5-20250929',
    timeout_ms: 75_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 30_000 },
  },
  {
    task: 'capture_plan',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 60_000,
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
  {
    task: 'black_hat_analysis',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 15_000,
    fallback: null,
  },
  {
    task: 'risk_generation',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 20_000,
    fallback: null,
  },
  {
    task: 'award_analysis',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 15_000,
    fallback: null,
  },
  {
    task: 'competitor_analysis',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 20_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'contact_enrich',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 15_000,
    fallback: null,
  },
  {
    task: 'match_analysis',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 20_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'vault_document_parse',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 15_000,
    fallback: null,
  },
  {
    task: 'vault_smart_route',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 15_000,
    fallback: null,
  },
  {
    task: 'financial_statement_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'balance_sheet_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'cost_detail_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'sie_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'ap_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'ar_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'trial_balance_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'project_revenue_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'digest_lead',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'competitor_contact_discovery',
    provider: 'perplexity',
    model: 'sonar-pro',
    timeout_ms: 25_000,
    fallback: null,
  },
  {
    task: 'partner_contact_discovery',
    provider: 'perplexity',
    model: 'sonar-pro',
    timeout_ms: 25_000,
    fallback: null,
  },
  {
    task: 'financial_analyze',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 60_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'vault_vehicle_extract',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 30_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 500 },
  },
  {
    task: 'workshop_teardown',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 90_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 30_000 },
  },
  {
    task: 'workshop_generate',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    timeout_ms: 90_000,
    fallback: { provider: 'anthropic', model: 'claude-haiku-4-5', min_remaining_budget_ms: 30_000 },
  },
  {
    task: 'sitrep_document_analyze',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 20_000,
    fallback: null,
  },
  {
    task: 'ingest_classify',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    timeout_ms: 15_000,
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
