/**
 * F-405: Field merge — precedence stack + unified view.
 *
 * Produces a canonical merged opportunity view by combining the base
 * opportunity row, all linked source records, and human field overrides.
 *
 * ## Precedence stack (highest wins)
 *   1. opportunity_field_overrides (human edits)
 *   2. GovWin source data
 *   3. SAM source data
 *   4. GovTribe source data
 *   5. Fast Track source data (NSF/SBIR/NIH/arXiv/RSS)
 *
 * ## Per-field rules
 *   - title          — first non-null per precedence
 *   - agency         — first non-null per precedence
 *   - estimated_value_cents — GovWin > SAM > GovTribe (Fast Track unreliable)
 *   - response_due_at — SAM > GovWin > GovTribe (SAM authoritative for federal)
 *   - pwin           — always computed, never merged from source
 *   - doctrine_status — always computed
 *
 * ## Caching
 *   Merge results are cached in merged_opportunity_cache with 60s TTL.
 *   Cache is invalidated when an override is written.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { OpportunityRow } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source types in precedence order (index 0 = highest) */
export const SOURCE_PRECEDENCE = ['govwin', 'sam', 'govtribe', 'fast_track'] as const;
export type SourceType = (typeof SOURCE_PRECEDENCE)[number];

/** Per-field precedence overrides for specific fields */
const VALUE_PRECEDENCE: SourceType[] = ['govwin', 'sam', 'govtribe'];
const DUE_DATE_PRECEDENCE: SourceType[] = ['sam', 'govwin', 'govtribe'];

export interface OpportunityLink {
  id: string;
  opportunity_id: string;
  source_type: SourceType;
  source_record_id: string;
  snapshot: Record<string, unknown>;
  linked_at: string;
  updated_at: string;
}

export interface FieldOverride {
  id: string;
  opportunity_id: string;
  field_name: string;
  field_value: string | null;
  set_by: string;
  set_at: string;
}

export interface MergedField<T = string | null> {
  value: T;
  source: 'override' | SourceType | 'base';
  set_at?: string;
}

export interface MergedOpportunity {
  internal_id: string;
  title: MergedField<string>;
  agency: MergedField;
  estimated_value_cents: MergedField<number | null>;
  response_due_at: MergedField;
  pwin: MergedField<number | null>;
  doctrine_status: MergedField;

  // Pass-through from base row
  status: string;
  naics: string | null;
  set_aside: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  description: string | null;
  grade: string | null;
  data_source: string;
  created_at: string;
  updated_at: string;

  // Linked sources + overrides for transparency
  links: OpportunityLink[];
  overrides: FieldOverride[];
  merged_at: string;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

interface LinkRow {
  id: string;
  opportunity_id: string;
  source_type: string;
  source_record_id: string;
  snapshot: Record<string, unknown>;
  linked_at: string;
  updated_at: string;
}

interface OverrideRow {
  id: string;
  opportunity_id: string;
  field_name: string;
  field_value: string | null;
  set_by: string;
  set_at: string;
}

interface CacheRow {
  merged_data: MergedOpportunity;
  computed_at: string;
}

async function fetchLinks(opportunityId: string): Promise<OpportunityLink[]> {
  const res = await pool.query<LinkRow>(
    `SELECT id::text, opportunity_id::text, source_type, source_record_id,
            snapshot, linked_at, updated_at
     FROM opportunity_links
     WHERE opportunity_id = $1
     ORDER BY ARRAY_POSITION(ARRAY['govwin','sam','govtribe','fast_track'], source_type)`,
    [opportunityId],
  );
  return res.rows.map((r) => ({
    ...r,
    source_type: r.source_type as SourceType,
  }));
}

async function fetchOverrides(opportunityId: string): Promise<FieldOverride[]> {
  const res = await pool.query<OverrideRow>(
    `SELECT id::text, opportunity_id::text, field_name, field_value, set_by, set_at
     FROM opportunity_field_overrides
     WHERE opportunity_id = $1
     ORDER BY set_at DESC`,
    [opportunityId],
  );
  return res.rows;
}

async function fetchBaseRow(opportunityId: string): Promise<OpportunityRow | null> {
  const res = await pool.query<OpportunityRow>(
    'SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
    [opportunityId],
  );
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Merge logic (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Extract a field value from a link snapshot.
 * Snapshots store source-specific data as JSON; field names may differ
 * per source type. This normalizes them.
 */
function snapshotField(snapshot: Record<string, unknown>, field: string): string | null {
  const val = snapshot[field];
  if (val === undefined || val === null || val === '') return null;
  return String(val);
}

function snapshotNumber(snapshot: Record<string, unknown>, field: string): number | null {
  const val = snapshot[field];
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * Generic first-non-null merge across links in precedence order.
 */
export function mergeFirstNonNull(
  links: OpportunityLink[],
  field: string,
  precedence: readonly SourceType[],
  overrides: Map<string, FieldOverride>,
  baseValue: string | null,
): MergedField {
  // 1. Human override always wins
  const override = overrides.get(field);
  if (override) {
    return { value: override.field_value, source: 'override', set_at: override.set_at };
  }

  // 2. Walk source precedence
  for (const sourceType of precedence) {
    const link = links.find((l) => l.source_type === sourceType);
    if (link) {
      const val = snapshotField(link.snapshot, field);
      if (val !== null) {
        return { value: val, source: sourceType };
      }
    }
  }

  // 3. Fall back to base row
  return { value: baseValue, source: 'base' };
}

/**
 * Numeric merge with custom precedence (for estimated_value_cents).
 */
export function mergeNumeric(
  links: OpportunityLink[],
  field: string,
  precedence: readonly SourceType[],
  overrides: Map<string, FieldOverride>,
  baseValue: number | null,
): MergedField<number | null> {
  // 1. Human override
  const override = overrides.get(field);
  if (override) {
    const n = override.field_value !== null ? Number(override.field_value) : null;
    return {
      value: Number.isNaN(n) ? null : n,
      source: 'override',
      set_at: override.set_at,
    };
  }

  // 2. Walk source precedence
  for (const sourceType of precedence) {
    const link = links.find((l) => l.source_type === sourceType);
    if (link) {
      const val = snapshotNumber(link.snapshot, field);
      if (val !== null) {
        return { value: val, source: sourceType };
      }
    }
  }

  // 3. Fall back to base row
  return { value: baseValue, source: 'base' };
}

/**
 * Build the full merged opportunity from base row, links, and overrides.
 * Pure function — no DB access, fully testable.
 */
export function buildMergedOpportunity(
  row: OpportunityRow,
  links: OpportunityLink[],
  overridesList: FieldOverride[],
): MergedOpportunity {
  const overrides = new Map(overridesList.map((o) => [o.field_name, o]));

  const title = mergeFirstNonNull(
    links, 'title', SOURCE_PRECEDENCE, overrides, row.title,
  );

  const agency = mergeFirstNonNull(
    links, 'agency', SOURCE_PRECEDENCE, overrides, row.agency,
  );

  const estimatedValueCents = mergeNumeric(
    links, 'estimated_value_cents', VALUE_PRECEDENCE, overrides,
    row.value_max !== null ? Number(row.value_max) : null,
  );

  const responseDueAt = mergeFirstNonNull(
    links, 'response_due_at', DUE_DATE_PRECEDENCE, overrides,
    row.response_due_at,
  );

  // pwin — always computed, never merged from source
  const pwin: MergedField<number | null> = {
    value: null,
    source: 'base',
  };

  // doctrine_status — always computed
  const doctrineStatus: MergedField = {
    value: null,
    source: 'base',
  };

  return {
    internal_id: String(row.id),
    title: { ...title, value: title.value ?? row.title },
    agency,
    estimated_value_cents: estimatedValueCents,
    response_due_at: responseDueAt,
    pwin,
    doctrine_status: doctrineStatus,

    status: row.status,
    naics: row.naics,
    set_aside: row.set_aside,
    solicitation_number: row.solicitation_number,
    sam_notice_id: row.sam_notice_id,
    description: row.description,
    grade: row.grade,
    data_source: row.data_source,
    created_at: row.created_at,
    updated_at: row.updated_at,

    links,
    overrides: overridesList,
    merged_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cache layer — 60s TTL per internal_id
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

async function getCachedMerge(opportunityId: string): Promise<MergedOpportunity | null> {
  try {
    const res = await pool.query<CacheRow>(
      `SELECT merged_data, computed_at
       FROM merged_opportunity_cache
       WHERE opportunity_id = $1`,
      [opportunityId],
    );
    if (!res.rows[0]) return null;
    const { merged_data, computed_at } = res.rows[0];
    const age = Date.now() - new Date(computed_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    return merged_data;
  } catch {
    return null;
  }
}

async function setCachedMerge(
  opportunityId: string,
  merged: MergedOpportunity,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO merged_opportunity_cache (opportunity_id, merged_data, computed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (opportunity_id)
       DO UPDATE SET merged_data = EXCLUDED.merged_data, computed_at = EXCLUDED.computed_at`,
      [opportunityId, JSON.stringify(merged)],
    );
  } catch (err) {
    logger.warn({ err, opportunityId }, 'Failed to cache merged opportunity');
  }
}

/**
 * Invalidate the merge cache for a given opportunity.
 * Called when an override is written or a link is updated.
 */
export async function invalidateMergeCache(opportunityId: string): Promise<void> {
  try {
    await pool.query(
      'DELETE FROM merged_opportunity_cache WHERE opportunity_id = $1',
      [opportunityId],
    );
  } catch (err) {
    logger.warn({ err, opportunityId }, 'Failed to invalidate merge cache');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * OpportunityRepo.getMerged(internal_id) — the main entry point.
 *
 * Returns a MergedOpportunity by joining the base row, all linked
 * source records, and all human field overrides.
 */
export async function getMerged(internalId: string): Promise<MergedOpportunity | null> {
  // 1. Check cache
  const cached = await getCachedMerge(internalId);
  if (cached) return cached;

  // 2. Fetch base row
  const row = await fetchBaseRow(internalId);
  if (!row) return null;

  // 3. Fetch links + overrides
  const [links, overrides] = await Promise.all([
    fetchLinks(internalId),
    fetchOverrides(internalId),
  ]);

  // 4. Build merged view
  const merged = buildMergedOpportunity(row, links, overrides);

  // 5. Cache result
  await setCachedMerge(internalId, merged);

  return merged;
}

/**
 * Write a field override and invalidate the merge cache.
 */
export async function setFieldOverride(
  opportunityId: string,
  fieldName: string,
  fieldValue: string | null,
  setBy: string,
): Promise<FieldOverride> {
  const res = await pool.query<OverrideRow>(
    `INSERT INTO opportunity_field_overrides (opportunity_id, field_name, field_value, set_by, set_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (opportunity_id, field_name)
     DO UPDATE SET field_value = EXCLUDED.field_value,
                   set_by = EXCLUDED.set_by,
                   set_at = NOW()
     RETURNING id::text, opportunity_id::text, field_name, field_value, set_by, set_at`,
    [opportunityId, fieldName, fieldValue, setBy],
  );

  // Invalidate cache on override write
  await invalidateMergeCache(opportunityId);

  return res.rows[0]!;
}

/**
 * Link a source record to an opportunity and invalidate the merge cache.
 */
export async function linkSourceRecord(
  opportunityId: string,
  sourceType: SourceType,
  sourceRecordId: string,
  snapshot: Record<string, unknown>,
): Promise<OpportunityLink> {
  const res = await pool.query<LinkRow>(
    `INSERT INTO opportunity_links (opportunity_id, source_type, source_record_id, snapshot)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (opportunity_id, source_type, source_record_id)
     DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
     RETURNING id::text, opportunity_id::text, source_type, source_record_id,
               snapshot, linked_at, updated_at`,
    [opportunityId, sourceType, sourceRecordId, JSON.stringify(snapshot)],
  );

  await invalidateMergeCache(opportunityId);

  return {
    ...res.rows[0]!,
    source_type: res.rows[0]!.source_type as SourceType,
  };
}
