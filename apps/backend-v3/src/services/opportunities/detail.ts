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
import { buildFieldSourceRefs } from '../../lib/source-urls.js';
import type { SourceRef } from '../../lib/sources.js';
import { computeDoctrineBadge, type DoctrineBadge } from '../doctrine/badge.js';
import type { Competitor } from './types.js';

// ─── Exported types ──────────────────────────────────────────────────────────

/** Per-field merged value plus the source that supplied it. */
export interface MergedField {
  value: unknown;
  source: string | null;
  /** R1 (F-420a): clickable provenance links for the winning source. */
  sources: SourceRef[];
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
  doctrine_badge: DoctrineBadge;
  candidate_partners: string[];
  competitors: Competitor[];
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
    const source = merged.field_sources[field] ?? null;
    out[field] = {
      value: m[field] ?? null,
      source,
      sources: buildFieldSourceRefs(source, merged.links),
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

// ─── F-437: resolve doctrine badge + teammates/competitors from analysis ────

interface DoctrineEnrichment {
  badge: DoctrineBadge;
  candidatePartners: string[];
  competitors: Competitor[];
}

/**
 * Pull doctrine badge, teammates, and competitors for a unified opportunity.
 * Wrapped in try/catch so enrichment failures never break the detail endpoint.
 *
 * Key id types:
 *  - pwin_features.opportunity_id = uuid (keyed on unified_opportunities.internal_id)
 *  - opportunities.id = bigint (only needed for analysis.competitors)
 *
 * Badge + candidate_partners come from pwin_features (uuid path).
 * Competitors come from opportunities.analysis (bigint path, independently guarded).
 */
async function resolveDoctrineEnrichment(
  pool: pg.Pool,
  merged: MergedOpportunity,
): Promise<DoctrineEnrichment> {
  const none: DoctrineEnrichment = {
    badge: computeDoctrineBadge({}),
    candidatePartners: [],
    competitors: [],
  };

  // Badge + partners: pwin_features keyed on uuid internal_id.
  let doctrineAlignmentScore: number | null = null;
  let candidatePartners: string[] = [];
  try {
    const featRes = await pool.query<{ features: Record<string, unknown> }>(
      `SELECT features FROM pwin_features
       WHERE opportunity_id = $1 ORDER BY computed_at DESC LIMIT 1`,
      [merged.internal_id],
    );
    const features = featRes.rows[0]?.features;
    doctrineAlignmentScore =
      (features?.doctrine_alignment_score as number | undefined) ?? null;
    candidatePartners =
      (features?.candidate_partners as string[] | undefined) ?? [];
  } catch {
    // pwin_features lookup failed — badge defaults to none, partners empty.
  }

  // Competitors: lives in bigint opportunities.analysis — resolve via link table.
  let competitors: Competitor[] = [];
  try {
    const oppIdRes = await pool.query<{ id: string }>(
      `SELECT o.id FROM opportunities o
       JOIN unified_opportunity_links l ON (
         (l.source = 'sam'      AND o.sam_notice_id = l.source_native_id AND o.data_source = 'sam_gov')
         OR (l.source = 'govwin'   AND o.sam_notice_id = 'govwin-' || l.source_native_id)
         OR (l.source = 'govtribe' AND o.govtribe_id  = l.source_native_id)
       )
       WHERE l.internal_id = $1 AND o.deleted_at IS NULL
       LIMIT 1`,
      [merged.internal_id],
    );
    const oppId = oppIdRes.rows[0]?.id;
    if (oppId) {
      const analysisRes = await pool.query<{ analysis: Record<string, unknown> | null }>(
        `SELECT analysis FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
        [oppId],
      );
      const analysis = analysisRes.rows[0]?.analysis;
      const rawCompetitors = (analysis?.competitors ?? []) as Array<Record<string, unknown>>;
      competitors = rawCompetitors
        .filter((c) => typeof c.name === 'string')
        .map((c) => ({
          name: c.name as string,
          threat_level: (c.threat_level as Competitor['threat_level']) ?? 'medium',
        }));
    }
  } catch {
    // competitors lookup failed — empty array.
  }

  const badge = computeDoctrineBadge({ doctrineAlignmentScore });
  return { badge, candidatePartners, competitors };
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
  const [sources, enrichment] = await Promise.all([
    fetchSourceRecords(pool, merged.links),
    resolveDoctrineEnrichment(pool, merged),
  ]);

  return {
    internal_id: merged.internal_id,
    lifecycle_stage: merged.lifecycle_stage,
    primary_source: merged.primary_source,
    pwin: merged.pwin,
    doctrine_status: merged.doctrine_status,
    doctrine_badge: enrichment.badge,
    candidate_partners: enrichment.candidatePartners,
    competitors: enrichment.competitors,
    created_at: merged.created_at,
    updated_at: merged.updated_at,
    merged_fields: buildMergedFields(merged),
    sources,
    conflicts: computeConflicts(sources, merged.field_sources),
    lineage: toLineage(merged.links),
  };
}

// ─── F-411: unified list with lifecycle_stage filtering ─────────────────────

/**
 * Named stage groups that map directly to the planned UI tabs
 * (architecture doc §"Tabs"). A request may pass either a single
 * lifecycle_stage value OR one of these group names.
 */
export const STAGE_GROUPS: Record<string, readonly string[]> = {
  active: ['solicitation'],
  pipeline: ['forecast', 'pre_sol'],
  fast_track: ['signal'],
  awarded: ['awarded', 'post_award'],
};

const VALID_STAGES = new Set([
  'signal',
  'forecast',
  'pre_sol',
  'solicitation',
  'awarded',
  'post_award',
  'closed',
]);

export interface UnifiedListItem {
  internal_id: string;
  lifecycle_stage: string;
  primary_source: string | null;
  title: string | null;
  agency: string | null;
  naics: string | null;
  set_aside: string | null;
  estimated_value_cents: number | null;
  response_due_at: string | null;
  posted_at: string | null;
  pwin: number | null;
  doctrine_status: string | null;
  updated_at: string;
  /** R1: clickable provenance links back to the primary-source record. */
  sources: SourceRef[];
}

export interface UnifiedListFilters {
  /** Single lifecycle_stage value OR a STAGE_GROUPS key (active/pipeline/fast_track/awarded). */
  stage?: string;
  agency?: string;
  naics?: string;
  limit?: number;
  /** Opaque base64 cursor: { updated_at, internal_id }. */
  cursor?: string;
}

export interface UnifiedListResult {
  items: UnifiedListItem[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

/** Resolve a stage filter to a concrete list of lifecycle_stage values. */
export function resolveStages(stage: string | undefined): string[] | null {
  if (!stage) return null;
  if (stage in STAGE_GROUPS) return [...STAGE_GROUPS[stage]];
  if (VALID_STAGES.has(stage)) return [stage];
  // Unknown stage token — caller should 400.
  return [];
}

/**
 * List unified opportunities with optional lifecycle_stage (or stage-group)
 * filtering. Orders by (updated_at DESC, internal_id DESC) for stable
 * keyset pagination. Uses the idx_unified_opps_stage_due index when stage
 * is supplied.
 */
export async function listUnifiedOpportunities(
  pool: pg.Pool,
  filters: UnifiedListFilters,
): Promise<UnifiedListResult> {
  // Guard against NaN/Infinity from a non-numeric query param (e.g. ?limit=abc):
  // NaN is not nullish so ?? would not catch it, and NaN would propagate to the
  // SQL LIMIT clause. Fall back to the default 50 for any non-finite value.
  const rawLimit = filters.limit;
  const safeLimit = typeof rawLimit === "number" && Number.isFinite(rawLimit) ? rawLimit : 50;
  const limit = Math.min(Math.max(safeLimit, 1), 200);
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const stages = resolveStages(filters.stage);
  if (stages) {
    conditions.push(`lifecycle_stage = ANY($${i++}::opportunity_lifecycle_stage[])`);
    params.push(stages);
  }
  if (filters.agency) {
    conditions.push(`agency ILIKE $${i++}`);
    params.push(`%${filters.agency}%`);
  }
  if (filters.naics) {
    conditions.push(`naics ILIKE $${i++}`);
    params.push(`%${filters.naics}%`);
  }

  if (filters.cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(filters.cursor, 'base64').toString('utf-8'),
      ) as { updated_at: string; internal_id: string };
      conditions.push(
        `(updated_at, internal_id) < ($${i++}, $${i++})`,
      );
      params.push(decoded.updated_at, decoded.internal_id);
    } catch {
      // invalid cursor — ignore
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT internal_id, lifecycle_stage, primary_source, title, agency, naics,
           set_aside, estimated_value_cents, response_due_at::text,
           posted_at::text, pwin, doctrine_status, updated_at::text
    FROM unified_opportunities
    ${where}
    ORDER BY updated_at DESC, internal_id DESC
    LIMIT $${i}`;
  params.push(limit + 1);

  const res = await pool.query(sql, params);
  const rows = res.rows as Array<Record<string, unknown>>;

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const items: UnifiedListItem[] = slice.map((r) => ({
    internal_id: r.internal_id as string,
    lifecycle_stage: r.lifecycle_stage as string,
    primary_source: (r.primary_source as string) ?? null,
    title: (r.title as string) ?? null,
    agency: (r.agency as string) ?? null,
    naics: (r.naics as string) ?? null,
    set_aside: (r.set_aside as string) ?? null,
    estimated_value_cents:
      r.estimated_value_cents != null ? Number(r.estimated_value_cents) : null,
    response_due_at: (r.response_due_at as string) ?? null,
    posted_at: (r.posted_at as string) ?? null,
    pwin: r.pwin != null ? Number(r.pwin) : null,
    doctrine_status: (r.doctrine_status as string) ?? null,
    updated_at: r.updated_at as string,
    sources: [] as SourceRef[],
  }));

  // R1: attach clickable provenance links. Batch-fetch the primary-source
  // link row for every item in one query (avoids N+1), then build the
  // SourceRef for each item from its own primary_source + matching link.
  if (items.length > 0) {
    const ids = items.map((it) => it.internal_id);
    const linkRes = await pool.query(
      `SELECT internal_id, source, source_native_id
         FROM unified_opportunity_links
        WHERE internal_id = ANY($1::uuid[])`,
      [ids],
    );
    const linksByInternalId = new Map<
      string,
      Array<{ source: string; source_native_id: string }>
    >();
    for (const lr of linkRes.rows as Array<Record<string, unknown>>) {
      const key = lr.internal_id as string;
      const arr = linksByInternalId.get(key) ?? [];
      arr.push({
        source: lr.source as string,
        source_native_id: lr.source_native_id as string,
      });
      linksByInternalId.set(key, arr);
    }
    for (const it of items) {
      it.sources = buildFieldSourceRefs(
        it.primary_source,
        linksByInternalId.get(it.internal_id) ?? [],
      );
    }
  }

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    nextCursor = Buffer.from(
      JSON.stringify({ updated_at: last.updated_at, internal_id: last.internal_id }),
    ).toString('base64');
  }

  return { items, pagination: { limit, cursor: nextCursor, hasMore } };
}


// ─── F-420a (R2): resolve the underlying opportunities.id for analysis ───────

/**
 * Map a unified opportunity to the opportunities.id row that the analysis
 * pipeline operates on, via the primary-source link (or the first
 * addressable link). Returns null when no analyzable source row exists.
 *
 * Native-id -> opportunities lookup mirrors merge.fetchSourceRecords:
 *   sam      -> opportunities.sam_notice_id = native_id (data_source sam_gov)
 *   govwin   -> opportunities.sam_notice_id = govwin- || native_id
 *   govtribe -> opportunities.govtribe_id   = native_id
 * fast_track has no analyzable opportunities row and is skipped.
 */
export async function resolvePrimaryOpportunityId(
  pool: pg.Pool,
  detail: UnifiedOpportunityDetail,
): Promise<string | null> {
  const order = (detail.primary_source ? [detail.primary_source] : []).concat(
    detail.lineage.map((l) => l.source),
  );
  const seen = new Set<string>();
  for (const source of order) {
    if (seen.has(source)) continue;
    seen.add(source);
    const link = detail.lineage.find((l) => l.source === source);
    if (!link) continue;

    let sql: string | null = null;
    let param: string | null = null;
    if (source === 'sam') {
      sql =
        "SELECT id FROM opportunities WHERE sam_notice_id = $1 AND data_source = 'sam_gov' AND deleted_at IS NULL LIMIT 1";
      param = link.source_native_id;
    } else if (source === 'govwin') {
      sql = 'SELECT id FROM opportunities WHERE sam_notice_id = $1 AND deleted_at IS NULL LIMIT 1';
      param = `govwin-${link.source_native_id}`;
    } else if (source === 'govtribe') {
      sql = 'SELECT id FROM opportunities WHERE govtribe_id = $1 AND deleted_at IS NULL LIMIT 1';
      param = link.source_native_id;
    } else {
      continue; // fast_track / unknown — not analyzable
    }

    const res = await pool.query<{ id: string }>(sql, [param]);
    if (res.rows[0]?.id) return res.rows[0].id;
  }
  return null;
}
