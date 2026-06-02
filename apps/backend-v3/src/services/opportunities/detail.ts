/**
 * Unified opportunity detail builder (F-410).
 *
 * Composes the canonical unified-view payload for a single `internal_id` by
 * reusing the F-405 merge service. Returns the contract specified in the
 * unified-opportunity architecture doc (Phase 2):
 *
 *   {
 *     internal_id, lifecycle_stage, primary_source,
 *     pwin, doctrine_status, created_at, updated_at,
 *     merged_fields: { <field>: { value, source } },   // value + provenance
 *     sources:       [ { source, ...raw field values } ],
 *     conflicts:     [ { field, values: [{ source, value }], chosen } ],
 *     lineage:       [ { source, source_native_id, confidence,
 *                        match_method, matched_at, confirmed_by, confirmed_at } ],
 *   }
 *
 * All DB access is delegated to the merge service — this module adds no new
 * queries, so it inherits the merge service's 60s cache + precedence rules.
 */

import type pg from 'pg';
import {
  getMergedOpportunity,
  fetchSourceRecords,
  type SourceRecord,
  type MergedOpportunity,
} from './merge.js';
import type { OpportunityLink } from '../../db/types/opportunity.js';

// ─── Exported types ──────────────────────────────────────────────────────────

/** Per-field merged value plus the source that supplied it. */
export interface MergedField {
  value: unknown;
  source: string | null;
}

/** A field where two or more sources disagree on a non-null value. */
export interface FieldConflict {
  field: string;
  values: Array<{ source: string; value: unknown }>;
  /** The source whose value won per the merge precedence stack. */
  chosen: string | null;
}

/** One link row, surfaced as a lineage entry. */
export interface LineageEntry {
  source: string;
  source_native_id: string;
  confidence: string | null;
  match_method: string | null;
  matched_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface UnifiedOpportunityDetail {
  internal_id: string;
  lifecycle_stage: string;
  primary_source: string | null;
  pwin: number | null;
  doctrine_status: string | null;
  created_at: string;
  updated_at: string;
  merged_fields: Record<string, MergedField>;
  sources: SourceRecord[];
  conflicts: FieldConflict[];
  lineage: LineageEntry[];
}

// ─── Fields that participate in the merge (and thus in conflict detection) ───

const MERGED_FIELD_NAMES = [
  'title',
  'agency',
  'office',
  'naics',
  'psc',
  'set_aside',
  'estimated_value_cents',
  'posted_at',
  'response_due_at',
  'award_at',
] as const;

/**
 * Compute conflicts: for each merged field, gather all distinct non-null
 * values across source records. If two or more sources hold differing
 * non-null values, that field is in conflict. `chosen` is the source the
 * merge precedence stack actually selected (from field_sources).
 */
function computeConflicts(
  sources: SourceRecord[],
  fieldSources: Record<string, string>,
): FieldConflict[] {
  const conflicts: FieldConflict[] = [];

  for (const field of MERGED_FIELD_NAMES) {
    const present: Array<{ source: string; value: unknown }> = [];
    for (const rec of sources) {
      const val = (rec as unknown as Record<string, unknown>)[field];
      if (val != null) {
        present.push({ source: rec.source, value: val });
      }
    }

    // Conflict only when >= 2 sources hold *differing* non-null values.
    const distinct = new Set(present.map((p) => JSON.stringify(p.value)));
    if (present.length >= 2 && distinct.size >= 2) {
      conflicts.push({
        field,
        values: present,
        chosen: fieldSources[field] ?? null,
      });
    }
  }

  return conflicts;
}

/** Build the merged_fields map (value + provenance) from the merged record. */
function buildMergedFields(merged: MergedOpportunity): Record<string, MergedField> {
  const out: Record<string, MergedField> = {};
  const m = merged as unknown as Record<string, unknown>;
  for (const field of MERGED_FIELD_NAMES) {
    out[field] = {
      value: m[field] ?? null,
      source: merged.field_sources[field] ?? null,
    };
  }
  return out;
}

function toLineage(links: OpportunityLink[]): LineageEntry[] {
  return links.map((l) => ({
    source: l.source,
    source_native_id: l.source_native_id,
    confidence: l.confidence ?? null,
    match_method: l.match_method ?? null,
    matched_at: l.matched_at ?? null,
    confirmed_by: l.confirmed_by ?? null,
    confirmed_at: l.confirmed_at ?? null,
  }));
}

/**
 * Build the full unified detail payload for an internal_id.
 * Returns null when no unified_opportunities row exists.
 */
export async function getUnifiedOpportunityDetail(
  pool: pg.Pool,
  internalId: string,
): Promise<UnifiedOpportunityDetail | null> {
  const merged = await getMergedOpportunity(pool, internalId);
  if (!merged) return null;

  // Raw per-source records (REJECTED links already filtered inside).
  const sources = await fetchSourceRecords(pool, merged.links);

  return {
    internal_id: merged.internal_id,
    lifecycle_stage: merged.lifecycle_stage,
    primary_source: merged.primary_source,
    pwin: merged.pwin,
    doctrine_status: merged.doctrine_status,
    created_at: merged.created_at,
    updated_at: merged.updated_at,
    merged_fields: buildMergedFields(merged),
    sources,
    conflicts: computeConflicts(sources, merged.field_sources),
    lineage: toLineage(merged.links),
  };
}
