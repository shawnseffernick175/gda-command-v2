/**
 * Types for the unified opportunity detail surface (F-420).
 * Mirrors the F-410 backend contract returned by
 *   GET /v3/opportunities/unified/:internal_id
 * (apps/backend-v3/src/services/opportunities/detail.ts).
 */

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

/** One source's raw record (shape varies per source; only `source` is guaranteed). */
export interface UnifiedSourceRecord {
  source: string;
  [key: string]: unknown;
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
  sources: UnifiedSourceRecord[];
  conflicts: FieldConflict[];
  lineage: LineageEntry[];
}
