/**
 * Lazy-loaded backend-v3 service adapters.
 *
 * Uses variable-path dynamic imports so TypeScript doesn't resolve
 * the full backend-v3 type graph (which OOMs the tsc process).
 * Local type mirrors in service-types.ts provide compile-time safety.
 */

import type pg from 'pg';
import type {
  MergedOpportunity,
  DoctrineEvaluation,
  PwinScoreResult,
  SearchResult,
  ActionItemRow,
  ActionItemListFilters,
  PipelineResult,
  PipelineListFilters,
  ColorTeamRunRow,
  AgentDecisionRow,
  LaunchpadSummary,
  DraftRow,
  DoctrineBadge,
  ComputeDoctrineBadgeInput,
} from './service-types.js';

/**
 * Import a module by variable path — TypeScript cannot statically resolve
 * the types, so it returns `any`. This prevents tsc from crawling the
 * entire backend-v3 dependency graph.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(specifier: string): Promise<any> {
  return import(specifier);
}

// Module paths (constants referenced by variable to defeat static resolution)
const MERGE_MODULE = '@gda/backend-v3/dist/services/opportunities/merge.js';
const DOCTRINE_MODULE = '@gda/backend-v3/dist/services/doctrine/evaluate.js';
const PWIN_MODULE = '@gda/backend-v3/dist/services/pwin/index.js';
const RAG_MODULE = '@gda/backend-v3/dist/services/rag/index.js';
const ACTION_ITEMS_MODULE = '@gda/backend-v3/dist/services/action-items/index.js';
const DRAFTS_MODULE = '@gda/backend-v3/dist/services/drafts/index.js';
const PIPELINE_MODULE = '@gda/backend-v3/dist/services/pipeline/index.js';
const COLOR_TEAMS_MODULE = '@gda/backend-v3/dist/services/color-teams/index.js';
const LAUNCHPAD_MODULE = '@gda/backend-v3/dist/services/launchpad/summary.js';
const MEMORY_MODULE = '@gda/backend-v3/dist/services/memory/index.js';
const BADGE_MODULE = '@gda/backend-v3/dist/services/doctrine/badge.js';

// ─── Merge service (F-405) ──────────────────────────────────────────────────

export async function getMergedOpportunity(
  pool: pg.Pool,
  internalId: string,
): Promise<MergedOpportunity | null> {
  const mod = await load(MERGE_MODULE);
  return mod.getMergedOpportunity(pool, internalId) as Promise<MergedOpportunity | null>;
}

// ─── Doctrine service ───────────────────────────────────────────────────────

export async function runDoctrineCheck(
  entityKind: string,
  entityId: string,
): Promise<DoctrineEvaluation> {
  const mod = await load(DOCTRINE_MODULE);
  return mod.runDoctrineCheck(entityKind, entityId) as Promise<DoctrineEvaluation>;
}

// ─── PWin service ───────────────────────────────────────────────────────────

export async function scoreOpportunity(opportunityId: string): Promise<PwinScoreResult> {
  const mod = await load(PWIN_MODULE);
  return mod.scoreOpportunity(opportunityId) as Promise<PwinScoreResult>;
}

// ─── RAG service ────────────────────────────────────────────────────────────

export async function ragSearch(opts: {
  query: string;
  top_k?: number;
}): Promise<SearchResult[]> {
  const mod = await load(RAG_MODULE);
  return mod.search(opts) as Promise<SearchResult[]>;
}

// ─── Action Items service ───────────────────────────────────────────────────

export async function listActionItems(
  _pool: pg.Pool,
  filters: ActionItemListFilters,
): Promise<{ items: ActionItemRow[]; hasMore: boolean; cursor: string | null }> {
  const mod = await load(ACTION_ITEMS_MODULE);
  return mod.listActionItems(filters) as Promise<{
    items: ActionItemRow[];
    hasMore: boolean;
    cursor: string | null;
  }>;
}

export async function toApiShape(row: ActionItemRow, drafts: object[] = []): Promise<object> {
  const mod = await load(ACTION_ITEMS_MODULE);
  return mod.toApiShape(row, drafts) as object;
}

// ─── Drafts service ─────────────────────────────────────────────────────────

export async function getDraftsByActionItem(
  _pool: pg.Pool,
  actionItemId: string,
): Promise<DraftRow[]> {
  const mod = await load(DRAFTS_MODULE);
  return mod.getDraftsByActionItem(actionItemId) as Promise<DraftRow[]>;
}

// ─── Pipeline service ───────────────────────────────────────────────────────

export async function listPipelineItems(
  filters: PipelineListFilters,
): Promise<PipelineResult> {
  const mod = await load(PIPELINE_MODULE);
  return mod.listPipelineItems(filters) as Promise<PipelineResult>;
}

// ─── Color Teams service ────────────────────────────────────────────────────

export async function isColorTeamEnabled(pool: pg.Pool): Promise<boolean> {
  const mod = await load(COLOR_TEAMS_MODULE);
  return mod.isColorTeamEnabled(pool) as Promise<boolean>;
}

export async function createColorTeamRun(
  pool: pg.Pool,
  opts: { document_id: string; colors: string[]; triggered_by: string },
): Promise<ColorTeamRunRow> {
  const mod = await load(COLOR_TEAMS_MODULE);
  return mod.createRun(pool, opts) as Promise<ColorTeamRunRow>;
}

export async function executeColorTeamRun(pool: pg.Pool, runId: string): Promise<void> {
  const mod = await load(COLOR_TEAMS_MODULE);
  return mod.executeColorTeamRun(pool, runId) as Promise<void>;
}

// ─── Launchpad service ──────────────────────────────────────────────────────

export async function computeLaunchpadSummary(): Promise<LaunchpadSummary> {
  const mod = await load(LAUNCHPAD_MODULE);
  return mod.computeSummary() as Promise<LaunchpadSummary>;
}

// ─── Memory service ─────────────────────────────────────────────────────────

export async function lookupSimilarDecisions(
  entityKind: string,
  kind: string,
  limit: number,
): Promise<AgentDecisionRow[]> {
  const mod = await load(MEMORY_MODULE);
  return mod.lookupSimilarDecisions(entityKind, kind, limit) as Promise<AgentDecisionRow[]>;
}

export async function getRecentDecisionsSummary(
  days: number,
  limit: number,
): Promise<AgentDecisionRow[]> {
  const mod = await load(MEMORY_MODULE);
  return mod.getRecentDecisionsSummary(days, limit) as Promise<AgentDecisionRow[]>;
}

// ─── Doctrine badge (F-437) ─────────────────────────────────────────────────

export async function computeDoctrineBadge(
  input: ComputeDoctrineBadgeInput,
): Promise<DoctrineBadge> {
  const mod = await load(BADGE_MODULE);
  return mod.computeDoctrineBadge(input) as DoctrineBadge;
}
