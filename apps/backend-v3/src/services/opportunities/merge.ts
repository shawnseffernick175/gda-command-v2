/**
 * Field merge — precedence stack + unified opportunity view (F-405).
 *
 * Takes an `internal_id` and returns the canonical merged opportunity by
 * combining all linked source records using a fixed precedence stack.
 *
 * ## Precedence stack (highest wins)
 *
 * 1. `unified_opportunity_field_overrides` (human edits)
 * 2. GovWin source data
 * 3. SAM source data
 *
 * ## Per-field rules
 *
 * | Field                 | Rule                                                 |
 * |-----------------------|------------------------------------------------------|
 * | title                 | First non-null per precedence                        |
 * | agency                | First non-null per precedence                        |
 * | office                | First non-null per precedence                        |
 * | naics                 | First non-null per precedence                        |
 * | psc                   | First non-null per precedence                        |
 * | set_aside             | First non-null per precedence                        |
 * | estimated_value_cents | GovWin > SAM                                         |
 * | response_due_at       | SAM > GovWin (SAM authoritative)                     |
 * | posted_at             | Earliest non-null across sources                     |
 * | award_at              | First non-null per precedence                        |
 * | pwin                  | Always from unified_opportunities row (never merged)  |
 * | doctrine_status       | Always from unified_opportunities row (never merged)  |
 */

import type pg from 'pg';
import type {
  Opportunity,
  OpportunityLink,
  OpportunityFieldOverride,
  DoctrineStatus,
} from '../../db/types/opportunity.js';

// ─── Exported types ──────────────────────────────────────────────────────────

export interface MergedOpportunity {
  internal_id: string;
  lifecycle_stage: string;
  primary_source: string | null;
  title: string | null;
  agency: string | null;
  office: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  estimated_value_cents: number | null;
  posted_at: string | null;
  response_due_at: string | null;
  award_at: string | null;
  /** Always from unified_opportunities — never merged from sources. */
  pwin: number | null;
  /** Always from unified_opportunities — never merged from sources. */
  doctrine_status: DoctrineStatus | null;
  created_at: string;
  updated_at: string;
  /** Which source provided each field. */
  field_sources: Record<string, string>;
  /** All linked source records. */
  links: OpportunityLink[];
}

// ─── Source-row shape (subset of legacy opportunities table) ─────────────────

export interface SourceRecord {
  source: string;
  title: string | null;
  agency: string | null;
  office: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  estimated_value_cents: number | null;
  posted_at: string | null;
  response_due_at: string | null;
  award_at: string | null;
}

// ─── Precedence order (lower index = higher priority) ────────────────────────

const SOURCE_PRECEDENCE: readonly string[] = ['govwin', 'sam'];

/**
 * Custom precedence for estimated_value_cents: GovWin > SAM.
 */
const VALUE_PRECEDENCE: readonly string[] = ['govwin', 'sam'];

/**
 * Custom precedence for response_due_at:
 * SAM > GovWin (SAM is authoritative for federal).
 */
const DUE_DATE_PRECEDENCE: readonly string[] = ['sam', 'govwin'];

// ─── LRU cache (TTL-based) ──────────────────────────────────────────────────

interface CacheEntry {
  value: MergedOpportunity;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 500;
const cache = new Map<string, CacheEntry>();

/** Evict expired + LRU entries when cache exceeds max size. */
function evictIfNeeded(): void {
  if (cache.size < CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  // If still over limit, drop oldest entries (insertion order)
  if (cache.size > CACHE_MAX_SIZE) {
    const excess = cache.size - CACHE_MAX_SIZE;
    let removed = 0;
    for (const key of cache.keys()) {
      if (removed >= excess) break;
      cache.delete(key);
      removed++;
    }
  }
}

/**
 * Invalidate the merge cache for a given internal_id.
 * Call this from any code path that writes to unified_opportunity_field_overrides.
 */
export function invalidateMergeCache(internalId: string): void {
  cache.delete(internalId);
}

/** Exported for testing — returns current cache size. */
export function mergeCacheSize(): number {
  return cache.size;
}

/** Exported for testing — clear entire cache. */
export function clearMergeCache(): void {
  cache.clear();
}

// ─── Core merge logic ────────────────────────────────────────────────────────

/**
 * Fetch source records from the legacy `opportunities` table for each linked source.
 *
 * Join strategy: single query using CASE-based lookup.
 * - SAM → opportunities.sam_notice_id = source_native_id, data_source = 'sam.gov' (legacy: 'sam_gov')
 * - GovWin → opportunities.sam_notice_id = 'govwin-' || source_native_id
 * - Fast Track → fast_track_assessments.input_hash = source_native_id
 */
export async function fetchSourceRecords(
  pool: pg.Pool,
  links: OpportunityLink[],
): Promise<SourceRecord[]> {
  const records: SourceRecord[] = [];

  for (const link of links) {
    if (link.confidence === 'REJECTED') continue;

    let row: SourceRecord | null = null;

    switch (link.source) {
      case 'sam': {
        const res = await pool.query(
          `SELECT title, agency, NULL AS office, naics, psc, set_aside,
                  CASE WHEN value_min IS NOT NULL THEN (value_min * 100)::bigint ELSE NULL END AS estimated_value_cents,
                  posted_at::text, response_due_at::text, NULL AS award_at
           FROM opportunities
           WHERE sam_notice_id = $1 AND data_source IN ('sam.gov', 'sam_gov')
           LIMIT 1`,
          [link.source_native_id],
        );
        if (res.rows[0]) {
          row = { source: 'sam', ...res.rows[0] } as SourceRecord;
        }
        break;
      }

      case 'govwin': {
        const res = await pool.query(
          `SELECT title, agency, NULL AS office, naics, NULL AS psc, set_aside,
                  CASE WHEN value_min IS NOT NULL THEN (value_min * 100)::bigint ELSE NULL END AS estimated_value_cents,
                  posted_at::text, response_due_at::text, NULL AS award_at
           FROM opportunities
           WHERE sam_notice_id = $1
           LIMIT 1`,
          [`govwin-${link.source_native_id}`],
        );
        if (res.rows[0]) {
          row = { source: 'govwin', ...res.rows[0] } as SourceRecord;
        }
        break;
      }

      case 'fast_track': {
        const res = await pool.query(
          `SELECT title, NULL AS agency, NULL AS office,
                  naics_codes[1] AS naics, NULL AS psc, set_aside,
                  NULL::bigint AS estimated_value_cents,
                  NULL AS posted_at, NULL AS response_due_at, NULL AS award_at
           FROM fast_track_assessments
           WHERE input_hash = $1
           ORDER BY generated_at DESC
           LIMIT 1`,
          [link.source_native_id],
        );
        if (res.rows[0]) {
          row = { source: 'fast_track', ...res.rows[0] } as SourceRecord;
        }
        break;
      }

      default:
        // Unknown sources are silently skipped
        break;
    }

    if (row) {
      // pg returns bigint columns as strings — coerce to number
      if (row.estimated_value_cents != null) {
        row.estimated_value_cents = Number(row.estimated_value_cents);
      }
      records.push(row);
    }
  }

  return records;
}

/**
 * Pick first non-null value from source records ordered by the given precedence.
 */
function pickByPrecedence<T>(
  sources: SourceRecord[],
  field: keyof SourceRecord,
  precedence: readonly string[],
): { value: T | null; source: string | null } {
  for (const sourceName of precedence) {
    const rec = sources.find((s) => s.source === sourceName);
    if (rec && rec[field] != null) {
      return { value: rec[field] as T, source: sourceName };
    }
  }
  return { value: null, source: null };
}

/**
 * Pick the earliest non-null date across all sources.
 */
function pickEarliest(
  sources: SourceRecord[],
  field: keyof SourceRecord,
): { value: string | null; source: string | null } {
  let earliest: string | null = null;
  let earliestSource: string | null = null;

  for (const rec of sources) {
    const val = rec[field] as string | null;
    if (val != null) {
      if (earliest == null || val < earliest) {
        earliest = val;
        earliestSource = rec.source;
      }
    }
  }

  return { value: earliest, source: earliestSource };
}

/**
 * Apply field overrides — override values take precedence over all source data.
 */
function applyOverrides(
  overrides: OpportunityFieldOverride[],
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const o of overrides) {
    map.set(o.field_name, o.field_value_json);
  }
  return map;
}

/**
 * Get a merged opportunity view by combining all linked source records
 * using the precedence stack.
 *
 * Results are cached for 60 seconds per internal_id.
 */
export async function getMergedOpportunity(
  pool: pg.Pool,
  internalId: string,
): Promise<MergedOpportunity | null> {
  // ── Cache check ──────────────────────────────────────────────────────────
  const cached = cache.get(internalId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // ── 1. Fetch unified row ─────────────────────────────────────────────────
  const unifiedRes = await pool.query(
    `SELECT * FROM unified_opportunities WHERE internal_id = $1`,
    [internalId],
  );
  const unified = unifiedRes.rows[0] as Opportunity | undefined;
  if (!unified) return null;

  // ── 2. Fetch links ──────────────────────────────────────────────────────
  const linksRes = await pool.query(
    `SELECT * FROM unified_opportunity_links WHERE internal_id = $1`,
    [internalId],
  );
  const links = linksRes.rows as OpportunityLink[];

  // ── 3. Fetch overrides ──────────────────────────────────────────────────
  const overridesRes = await pool.query(
    `SELECT * FROM unified_opportunity_field_overrides WHERE internal_id = $1`,
    [internalId],
  );
  const overrides = overridesRes.rows as OpportunityFieldOverride[];
  const overrideMap = applyOverrides(overrides);

  // ── 4. Fetch source records ─────────────────────────────────────────────
  const sources = await fetchSourceRecords(pool, links);

  // ── 5. Merge fields ─────────────────────────────────────────────────────
  const fieldSources: Record<string, string> = {};

  function mergeField<T>(
    fieldName: string,
    precedence: readonly string[],
  ): T | null {
    if (overrideMap.has(fieldName)) {
      fieldSources[fieldName] = 'override';
      return overrideMap.get(fieldName) as T;
    }
    const { value, source } = pickByPrecedence<T>(sources, fieldName as keyof SourceRecord, precedence);
    if (source) fieldSources[fieldName] = source;
    return value;
  }

  const title = mergeField<string>('title', SOURCE_PRECEDENCE);
  const agency = mergeField<string>('agency', SOURCE_PRECEDENCE);
  const office = mergeField<string>('office', SOURCE_PRECEDENCE);
  const naics = mergeField<string>('naics', SOURCE_PRECEDENCE);
  const psc = mergeField<string>('psc', SOURCE_PRECEDENCE);
  const set_aside = mergeField<string>('set_aside', SOURCE_PRECEDENCE);
  const award_at = mergeField<string>('award_at', SOURCE_PRECEDENCE);

  // estimated_value_cents — custom precedence (skip Fast Track for sols)
  let estimated_value_cents: number | null;
  if (overrideMap.has('estimated_value_cents')) {
    estimated_value_cents = overrideMap.get('estimated_value_cents') as number;
    fieldSources['estimated_value_cents'] = 'override';
  } else {
    const ev = pickByPrecedence<number>(sources, 'estimated_value_cents', VALUE_PRECEDENCE);
    estimated_value_cents = ev.value;
    if (ev.source) fieldSources['estimated_value_cents'] = ev.source;
  }

  // response_due_at — SAM > GovWin
  let response_due_at: string | null;
  if (overrideMap.has('response_due_at')) {
    response_due_at = overrideMap.get('response_due_at') as string;
    fieldSources['response_due_at'] = 'override';
  } else {
    const rd = pickByPrecedence<string>(sources, 'response_due_at', DUE_DATE_PRECEDENCE);
    response_due_at = rd.value;
    if (rd.source) fieldSources['response_due_at'] = rd.source;
  }

  // posted_at — earliest non-null across sources
  let posted_at: string | null;
  if (overrideMap.has('posted_at')) {
    posted_at = overrideMap.get('posted_at') as string;
    fieldSources['posted_at'] = 'override';
  } else {
    const pa = pickEarliest(sources, 'posted_at');
    posted_at = pa.value;
    if (pa.source) fieldSources['posted_at'] = pa.source;
  }

  // ── 6. Build result ─────────────────────────────────────────────────────
  const merged: MergedOpportunity = {
    internal_id: unified.internal_id,
    lifecycle_stage: unified.lifecycle_stage,
    primary_source: unified.primary_source,
    title,
    agency,
    office,
    naics,
    psc,
    set_aside,
    estimated_value_cents,
    posted_at,
    response_due_at,
    award_at,
    pwin: unified.pwin,
    doctrine_status: unified.doctrine_status,
    created_at: unified.created_at,
    updated_at: unified.updated_at,
    field_sources: fieldSources,
    links,
  };

  // ── 7. Cache ────────────────────────────────────────────────────────────
  evictIfNeeded();
  cache.set(internalId, { value: merged, expiresAt: Date.now() + CACHE_TTL_MS });

  return merged;
}
