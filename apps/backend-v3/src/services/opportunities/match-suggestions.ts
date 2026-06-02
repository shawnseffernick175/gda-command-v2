/**
 * Match suggestions queue (F-412).
 *
 * The cross-source matcher (F-403/F-404, MatcherV1) writes MEDIUM-confidence
 * links with `confirmed_by = NULL` — these are the "match suggestions" that
 * need a human decision. This module surfaces that review queue and applies
 * confirm / reject decisions.
 *
 * Data model (migration v3_026): suggestions are rows in
 * `unified_opportunity_links` where `confidence IN ('MEDIUM','LOW')`. The
 * partial index `idx_unified_opp_links_review_queue` backs the list query.
 * Terminal states are CONFIRMED / REJECTED (with confirmed_by + confirmed_at
 * stamped).
 *
 *   GET  /v3/match-suggestions            — list pending (MEDIUM/LOW) links
 *   POST /v3/match-suggestions            — { link_id, action, decided_by? }
 *                                            action = 'confirm' | 'reject'
 *
 * Confirming/rejecting a link changes which source records participate in the
 * merged view, so the merge cache for the affected internal_id is invalidated.
 */

import type pg from 'pg';
import { invalidateMergeCache } from './merge.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Confidence tiers that represent an unresolved suggestion (review queue). */
export const PENDING_CONFIDENCES = ['MEDIUM', 'LOW'] as const;

const VALID_ACTIONS = new Set(['confirm', 'reject']);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatchSuggestion {
  link_id: number;
  internal_id: string;
  source: string;
  source_native_id: string;
  confidence: string | null;
  match_method: string | null;
  matched_at: string | null;
  /** Context from the unified_opportunities row this link points at. */
  opportunity: {
    lifecycle_stage: string;
    primary_source: string | null;
    title: string | null;
    agency: string | null;
    naics: string | null;
    estimated_value_cents: number | null;
    response_due_at: string | null;
  };
}

export interface ListSuggestionsFilters {
  /** Restrict to a single confidence tier (MEDIUM or LOW). Default: both. */
  confidence?: string;
  /** Restrict to suggestions touching a single unified opportunity. */
  internal_id?: string;
  limit?: number;
  /** Opaque base64 keyset cursor: { matched_at, link_id }. */
  cursor?: string;
}

export interface ListSuggestionsResult {
  items: MatchSuggestion[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

export type SuggestionAction = 'confirm' | 'reject';

export interface DecisionInput {
  link_id: number;
  action: SuggestionAction;
  decided_by: string;
}

export interface DecisionResult {
  link_id: number;
  internal_id: string;
  source: string;
  source_native_id: string;
  confidence: string;
  confirmed_by: string;
  confirmed_at: string;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Returns true when `action` is an accepted decision verb. */
export function isValidAction(action: unknown): action is SuggestionAction {
  return typeof action === 'string' && VALID_ACTIONS.has(action);
}

/**
 * Coerce a raw `limit` query value into a clamped integer in [1, 200].
 * Guards against NaN/Infinity from a non-numeric query param (?limit=abc),
 * mirroring the hardening applied to the F-411 list endpoint.
 */
export function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  const safe = Number.isFinite(n) ? n : 50;
  return Math.min(Math.max(Math.trunc(safe), 1), 200);
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List pending match suggestions (MEDIUM/LOW links awaiting a decision),
 * newest match first. Joins to unified_opportunities for display context.
 * Keyset paginated on (matched_at DESC, id DESC).
 */
export async function listMatchSuggestions(
  pool: pg.Pool,
  filters: ListSuggestionsFilters,
): Promise<ListSuggestionsResult> {
  const limit = clampLimit(filters.limit);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  // Always restrict to the unresolved tiers. A caller-supplied confidence
  // narrows to a single tier (but never escapes the pending set).
  if (filters.confidence) {
    const tier = filters.confidence.toUpperCase();
    if (!PENDING_CONFIDENCES.includes(tier as (typeof PENDING_CONFIDENCES)[number])) {
      // Unknown/terminal tier requested — caller should 400 before calling,
      // but defend here by returning an empty page rather than leaking rows.
      return { items: [], pagination: { limit, cursor: null, hasMore: false } };
    }
    conditions.push(`l.confidence = $${i++}::opportunity_link_confidence`);
    params.push(tier);
  } else {
    conditions.push(
      `l.confidence = ANY($${i++}::opportunity_link_confidence[])`,
    );
    params.push([...PENDING_CONFIDENCES]);
  }

  if (filters.internal_id) {
    conditions.push(`l.internal_id = $${i++}`);
    params.push(filters.internal_id);
  }

  if (filters.cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(filters.cursor, 'base64').toString('utf-8'),
      ) as { matched_at: string | null; link_id: number };
      // matched_at may be NULL; order NULLs last and tiebreak on id.
      conditions.push(
        `(COALESCE(l.matched_at, '-infinity'::timestamptz), l.id) < ($${i++}::timestamptz, $${i++})`,
      );
      params.push(decoded.matched_at, decoded.link_id);
    } catch {
      // invalid cursor — ignore
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      l.id                         AS link_id,
      l.internal_id,
      l.source,
      l.source_native_id,
      l.confidence::text           AS confidence,
      l.match_method,
      l.matched_at::text           AS matched_at,
      o.lifecycle_stage::text      AS lifecycle_stage,
      o.primary_source,
      o.title,
      o.agency,
      o.naics,
      o.estimated_value_cents,
      o.response_due_at::text      AS response_due_at
    FROM unified_opportunity_links l
    JOIN unified_opportunities o ON o.internal_id = l.internal_id
    ${where}
    ORDER BY COALESCE(l.matched_at, '-infinity'::timestamptz) DESC, l.id DESC
    LIMIT $${i}`;
  params.push(limit + 1);

  const res = await pool.query(sql, params);
  const rows = res.rows as Array<Record<string, unknown>>;

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const items: MatchSuggestion[] = slice.map((r) => ({
    link_id: Number(r.link_id),
    internal_id: r.internal_id as string,
    source: r.source as string,
    source_native_id: r.source_native_id as string,
    confidence: (r.confidence as string) ?? null,
    match_method: (r.match_method as string) ?? null,
    matched_at: (r.matched_at as string) ?? null,
    opportunity: {
      lifecycle_stage: r.lifecycle_stage as string,
      primary_source: (r.primary_source as string) ?? null,
      title: (r.title as string) ?? null,
      agency: (r.agency as string) ?? null,
      naics: (r.naics as string) ?? null,
      estimated_value_cents:
        r.estimated_value_cents != null ? Number(r.estimated_value_cents) : null,
      response_due_at: (r.response_due_at as string) ?? null,
    },
  }));

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    nextCursor = Buffer.from(
      JSON.stringify({ matched_at: last.matched_at, link_id: last.link_id }),
    ).toString('base64');
  }

  return { items, pagination: { limit, cursor: nextCursor, hasMore } };
}

// ─── Decide (confirm / reject) ──────────────────────────────────────────────

/**
 * Apply a confirm/reject decision to a pending suggestion.
 *
 * Only links currently in a pending tier (MEDIUM/LOW) may be decided — this
 * makes the operation idempotency-safe against double-submits and prevents
 * overwriting a HIGH (auto-linked) row. The UPDATE is guarded in SQL with a
 * `confidence IN ('MEDIUM','LOW')` predicate so concurrent decisions cannot
 * both win.
 *
 * Returns null when no matching pending link exists (unknown id OR already
 * decided) — the route maps that to 404/409 as appropriate.
 */
export async function decideMatchSuggestion(
  pool: pg.Pool,
  input: DecisionInput,
): Promise<DecisionResult | null> {
  const newConfidence = input.action === 'confirm' ? 'CONFIRMED' : 'REJECTED';

  const sql = `
    UPDATE unified_opportunity_links
       SET confidence   = $1::opportunity_link_confidence,
           confirmed_by = $2,
           confirmed_at = NOW()
     WHERE id = $3
       AND confidence IN ('MEDIUM', 'LOW')
    RETURNING id AS link_id, internal_id, source, source_native_id,
              confidence::text AS confidence,
              confirmed_by, confirmed_at::text AS confirmed_at`;

  const res = await pool.query(sql, [newConfidence, input.decided_by, input.link_id]);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const internalId = row.internal_id as string;
  // The merged view depends on which links are CONFIRMED/REJECTED, so the
  // 60s merge cache for this opportunity is now stale.
  invalidateMergeCache(internalId);

  return {
    link_id: Number(row.link_id),
    internal_id: internalId,
    source: row.source as string,
    source_native_id: row.source_native_id as string,
    confidence: row.confidence as string,
    confirmed_by: row.confirmed_by as string,
    confirmed_at: row.confirmed_at as string,
  };
}
