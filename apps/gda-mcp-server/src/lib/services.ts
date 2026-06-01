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
