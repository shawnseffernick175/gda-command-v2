/**
 * Opportunity ingest validation guard.
 *
 * Pure functions, no DB access. Layer 2 recomputes/normalizes mapper output.
 * Layer 3 returns a reject reason string when the row carries no usable
 * signal or is internally inconsistent. Never throws; never fabricates.
 *
 * Mirrors the financials pattern in services/financials/ingest.ts so every
 * ingest path enforces the same "extract → recompute/normalize → reject if
 * impossible" contract.
 *
 * The guard is generic over OpportunityRow (SAM) and ExternalOpportunityRow
 * (every other source); idempotency keys (sam_notice_id vs external_id) are
 * guaranteed by the row types themselves and therefore NOT re-checked here.
 */

import { logger } from '../../lib/logger.js';

/**
 * Shared subset of fields the validator reads or rewrites. Both
 * OpportunityRow and ExternalOpportunityRow extend this; the validator is
 * generic so it works on either without two copies.
 */
export interface OpportunityValidationFields {
  title: string;
  description: string | null;
  data_source: string;
  agency: string | null;
  agency_name?: string | null;
  department_name?: string | null;
  office?: string | null;
  naics: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  posted_at: string | null;
  tags: string[];
  // Optional contextual identifiers used only in log lines:
  sam_notice_id?: string;
  external_id?: string;
}

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_TRILLION = 1_000_000_000_000;
const NAICS_RE = /^[0-9]{6}$/;

function parseISO(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isPlainStringWithContent(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Layer 2 — deterministic recompute / normalize. The mapper EXTRACTS; this
 * function VERIFIES and NORMALIZES before the row is persisted.
 *
 * Behavior contract:
 * - Never throws.
 * - Never fabricates a value from nothing (no "best guess" agencies, NAICS, etc).
 * - Logs a warn on every override (the "mapper drift caught" signal).
 * - Returns a NEW row; does not mutate the input.
 *
 * Rules (each independently testable):
 *   R1 dates: response_due_at must be >= posted_at; if violated, null
 *      response_due_at + warn.
 *   R2 dates: response_due_at more than 10 years in the future is a parse
 *      artifact; null + warn.
 *   R3 dates: posted_at more than 7 days in the future is a parse artifact;
 *      null + warn (only posted_at; response_due_at far-future is normal).
 *   R4 dollars: if value_min > value_max, swap + warn.
 *   R5 dollars: negative or >= $1T value is fake; null both + warn.
 *   R6 NAICS: must match /^[0-9]{6}$/ after trim; if not, null + warn.
 *      Preserve the raw bad value in tags as `bad_naics:<raw>` for audit.
 *   R7 agency fallback: if agency is null/empty, fall back through
 *      agency_name -> department_name -> office, copying the first non-empty
 *      value into agency. Does NOT touch the source field. Warn when a
 *      fallback fired so we can fix mapper at source.
 *   R8 set_aside: trim + collapse internal whitespace; do NOT translate
 *      vocabulary here (that is a separate canonical-vocab problem, out of
 *      scope; flag-only).
 */
export function validateAndRecompute<T extends OpportunityValidationFields>(opp: T): T {
  const out: T = { ...opp, tags: [...(opp.tags ?? [])] };
  const ctx = {
    data_source: out.data_source,
    sam_notice_id: out.sam_notice_id ?? null,
    external_id: out.external_id ?? null,
  };
  const now = Date.now();

  // R1 / R2 / R3 — dates
  const dueAt = parseISO(out.response_due_at);
  const postedAt = parseISO(out.posted_at);
  if (postedAt !== null && postedAt.getTime() > now + SEVEN_DAYS_MS) {
    logger.warn({ ...ctx, posted_at: out.posted_at }, 'opp validator: posted_at >7d in future, nulled');
    out.posted_at = null;
  }
  if (dueAt !== null && dueAt.getTime() > now + TEN_YEARS_MS) {
    logger.warn({ ...ctx, response_due_at: out.response_due_at }, 'opp validator: response_due_at >10y out, nulled');
    out.response_due_at = null;
  } else if (dueAt !== null && postedAt !== null && out.posted_at !== null && dueAt.getTime() < postedAt.getTime()) {
    logger.warn(
      { ...ctx, response_due_at: out.response_due_at, posted_at: out.posted_at },
      'opp validator: response_due_at < posted_at, response_due_at nulled',
    );
    out.response_due_at = null;
  }

  // R4 / R5 — dollars
  const vmin = out.value_min;
  const vmax = out.value_max;
  if (vmin !== null && vmax !== null && vmin > vmax) {
    logger.warn({ ...ctx, value_min: vmin, value_max: vmax }, 'opp validator: value_min > value_max, swapped');
    out.value_min = vmax;
    out.value_max = vmin;
  }
  for (const k of ['value_min', 'value_max'] as const) {
    const v = out[k];
    if (v !== null && (v < 0 || v >= ONE_TRILLION)) {
      logger.warn({ ...ctx, field: k, value: v }, 'opp validator: value out of range, nulled both');
      out.value_min = null;
      out.value_max = null;
      break;
    }
  }

  // R6 — NAICS
  if (isPlainStringWithContent(out.naics)) {
    const naics = out.naics.trim();
    if (!NAICS_RE.test(naics)) {
      logger.warn({ ...ctx, naics: out.naics }, 'opp validator: naics not 6-digit, nulled (raw preserved in tags)');
      const sanitized = naics.replace(/[,{}"\\]/g, '_');
      if (!out.tags.includes(`bad_naics:${sanitized}`)) out.tags.push(`bad_naics:${sanitized}`);
      out.naics = null;
    } else {
      out.naics = naics;
    }
  }

  // R7 — agency fallback
  if (!isPlainStringWithContent(out.agency)) {
    const fallback =
      (isPlainStringWithContent(out.agency_name) && out.agency_name) ||
      (isPlainStringWithContent(out.department_name) && out.department_name) ||
      (isPlainStringWithContent(out.office) && out.office) ||
      null;
    if (fallback) {
      logger.warn({ ...ctx, fallback_source: fallback }, 'opp validator: agency empty, filled from fallback chain');
      out.agency = fallback;
    }
  }

  // R8 — set_aside whitespace normalization
  if (isPlainStringWithContent(out.set_aside)) {
    out.set_aside = out.set_aside.trim().replace(/\s+/g, ' ');
  }

  return out;
}

/**
 * Layer 3 — storability guard. Returns a reject reason or null. Never throws.
 * Operates on the post-validate row. Rejected rows are NOT silently dropped;
 * caller writes them with `relevance_status='rejected'` and the reason in
 * `relevance_reason` so a human can audit (see source_writer wire-in).
 *
 * Idempotency-key check is NOT here: both row types enforce a required key
 * (sam_notice_id or external_id) at the type level, so a row missing one
 * cannot reach this function.
 *
 *   X1 no title (null/empty/"Untitled") AND no description.
 *   X2 stale-junk: response_due_at > 90 days in the past AND posted_at is null.
 */
export function rejectReason(opp: OpportunityValidationFields): string | null {
  const hasTitle = isPlainStringWithContent(opp.title) && opp.title.trim() !== 'Untitled';
  const hasDescription = isPlainStringWithContent(opp.description);
  if (!hasTitle && !hasDescription) {
    return 'no title and no description';
  }

  const dueAt = parseISO(opp.response_due_at);
  const postedAt = parseISO(opp.posted_at);
  if (dueAt !== null && postedAt === null && dueAt.getTime() < Date.now() - NINETY_DAYS_MS) {
    return 'response_due_at >90 days in the past with no posted_at (stale junk)';
  }

  return null;
}
