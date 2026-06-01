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

export function toApiShape(row: ActionItemRow, drafts: object[] = []): object {
  // Synchronous — thin re-export to keep tool files decoupled from backend-v3
  const sourceRef = {
    kind: 'internal' as const,
    title: row.source === 'email' ? 'Email ingest' : 'Manual entry',
    url: `/audit/edits/${row.id}`,
    retrieved_at: new Date().toISOString(),
  };
  return {
    id: row.id,
    title: row.title,
    title_sources: [sourceRef],
    detail: row.detail,
    detail_sources: row.detail ? [sourceRef] : [],
    owner: row.owner,
    owner_sources: [sourceRef],
    status: row.status,
    due_date: row.due_date,
    due_date_sources: row.due_date ? [sourceRef] : [],
    source: row.source,
    linked_record_type: row.linked_record_type,
    linked_record_id: row.linked_record_id,
    drafts,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
  limit: number,
): Promise<AgentDecisionRow[]> {
  const mod = await load(MEMORY_MODULE);
  return mod.lookupSimilarDecisions(entityKind, entityKind, limit) as Promise<AgentDecisionRow[]>;
}

export async function getRecentDecisionsSummary(
  days: number,
  limit: number,
): Promise<AgentDecisionRow[]> {
  const mod = await load(MEMORY_MODULE);
  return mod.getRecentDecisionsSummary(days, limit) as Promise<AgentDecisionRow[]>;
}
