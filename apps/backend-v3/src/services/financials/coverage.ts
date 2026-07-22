/**
 * Ingestion-coverage classification (zero-touch financial ingest, F-1142 Bug 3).
 *
 * WHY THIS EXISTS: the /v3/financials/ingestion-coverage endpoint used to bucket
 * every doc into just ingested / no_handler / extraction_failed. That made two
 * very different situations look identical and let files fail SILENTLY:
 *   - a re-uploaded MAR income statement, a PDF twin of an ingested xlsx, or a
 *     full-year rollup showed up as `no_handler` (a scary false alarm), and
 *   - a file whose handler DID match but produced 0 rows (a real parser bug)
 *     was indistinguishable from a file no handler recognized at all.
 *
 * The owner uploads a package and must never have to hand-fix ingestion, so every
 * doc has to carry an explicit, human-readable result. This module turns the raw
 * per-doc facts (did it extract? did any rows land? what type/period is it? did a
 * handler match?) into one of four statuses plus a reason:
 *
 *   INGESTED            -> rows landed in >=1 table
 *   SKIPPED (duplicate) -> another INGESTED doc already covers this type+period
 *                          (re-upload / PDF twin / full-year rollup) — not a failure
 *   NOT INGESTED        -> genuine miss, reason = parse_error (handler matched, 0
 *                          rows) or no_handler (no handler recognized the file)
 *   EXTRACTION FAILED   -> text extraction never succeeded
 *
 * This function is pure so it is unit-testable without a database.
 */

import type { FinancialDocClassification } from './reingest-doc.js';
import { inferPeriod } from './deterministic-parsers.js';

export type CoverageStatus =
  | 'ingested'
  | 'skipped_duplicate'
  | 'not_ingested'
  | 'extraction_failed';

/** The specialized parser types, in the priority order used to name a doc. */
const SPECIALIZED_TYPES: Array<[keyof FinancialDocClassification, string]> = [
  // Trended IS/BS is the authoritative reconcilable source and is recognized by
  // content fingerprint, so it wins over every legacy filename-driven type.
  ['is_income_statement', 'income_statement'],
  ['is_balance_sheet', 'balance_sheet'],
  ['is_trial_balance', 'trial_balance'],
  ['is_sie', 'sie'],
  ['is_ap', 'ap'],
  ['is_ar', 'ar'],
  ['is_project_actuals_targets', 'project_actuals_targets'],
  ['is_project_revenue', 'project_revenue'],
  ['is_cost_detail', 'cost_detail'],
];

/**
 * Resolve a single canonical "primary type" for a doc from its classification.
 * A specialized type wins over the generic P&L parser; income_statement is used
 * for a plain P&L. Returns null when no handler recognized the doc at all.
 */
export function primaryTypeOf(cls: FinancialDocClassification): string | null {
  for (const [flag, name] of SPECIALIZED_TYPES) {
    if (cls[flag]) return name;
  }
  if (cls.is_financial) return 'income_statement';
  return null;
}

/** True when ANY handler matched the doc (used to tell parse_error from no_handler). */
export function handlerMatched(cls: FinancialDocClassification): boolean {
  return primaryTypeOf(cls) !== null;
}

/** Filename stem, lowercased, without the extension — for PDF-twin detection. */
export function filenameStem(filename: string): string {
  return (filename || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim()
    .toLowerCase();
}

/** A full-year / all-months rollup rather than a single monthly package file. */
export function isFullYearRollup(filename: string): boolean {
  const fn = (filename || '').toLowerCase();
  // "Full ..." rollups (e.g. "Full Proj Revenue Summary") and explicit FY/annual
  // rollups with no single month token in the name.
  if (/\bfull\b/.test(fn)) return true;
  if (/(full[- ]?year|annual|ytd[- ]?total|rollup|roll[- ]?up)/.test(fn)) return true;
  return false;
}

export interface CoverageDocInput {
  doc_id: number;
  filename: string;
  extraction_status: string;
  /** Total rows this doc landed across all financial tables. */
  row_count: number;
  /** Canonical primary type, or null when no handler recognized the doc. */
  primary_type: string | null;
  /** Period label (e.g. "FY26 Mar") inferred from the filename, or null. */
  period: string | null;
  /** Whether any handler matched (distinguishes parse_error from no_handler). */
  handler_matched: boolean;
}

export interface CoverageDocVerdict {
  status: CoverageStatus;
  /** Human-readable explanation. Null only for a clean INGESTED doc. */
  reason: string | null;
  /** For a duplicate, the doc it duplicates (else null). */
  duplicate_of: number | null;
}

/**
 * Build a period label from a filename for coverage keying. Falls back to the
 * bare month/year token when inferPeriod can't produce a fiscal label so a
 * re-upload with an unusual name still keys to the same content bucket.
 */
export function inferDocPeriod(filename: string): string | null {
  const info = inferPeriod(filename || '');
  return info ? info.period : null;
}

/** Absolute month ordinal (fiscal_year*12 + month) for period comparison, or null. */
const MONTH_ORD: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
export function periodOrdinal(period: string | null): number | null {
  if (!period) return null;
  const m = period.match(/FY(\d{2})\s+([A-Za-z]{3})/);
  if (!m) return null;
  const mo = MONTH_ORD[m[2].toLowerCase()];
  if (!mo) return null;
  return (2000 + parseInt(m[1], 10)) * 12 + mo;
}

/**
 * The authoritative "umbrella" type that supersedes a doc for coverage purposes.
 * The trended Income Statement is the reconcilable source for its cost-detail and
 * SIE lines too, so all three collapse to income_statement; the balance sheet is
 * its own umbrella. Everything else has no cross-type umbrella (returns null).
 */
export function canonicalCoverageType(primaryType: string | null): string | null {
  if (primaryType === 'income_statement' || primaryType === 'cost_detail' || primaryType === 'sie') {
    return 'income_statement';
  }
  if (primaryType === 'balance_sheet') return 'balance_sheet';
  return null;
}

/**
 * Classify every financial doc's ingestion result. Returns a verdict per doc_id.
 *
 * Duplicate detection is deterministic and only ever DEMOTES a non-ingested doc
 * to SKIPPED — it never hides a genuine failure that has no ingested counterpart:
 *   1. same (primary_type, period) as an already-INGESTED doc  -> duplicate
 *   2. PDF whose filename stem matches an INGESTED doc's stem   -> duplicate (twin)
 *   3. a full-year rollup while monthly docs of its type ingested -> duplicate
 */
export function classifyCoverage(
  docs: CoverageDocInput[],
): Map<number, CoverageDocVerdict> {
  const result = new Map<number, CoverageDocVerdict>();

  // Index the docs that actually ingested rows so duplicates can point at them.
  const ingestedByContent = new Map<string, CoverageDocInput>();
  const ingestedByStem = new Map<string, CoverageDocInput>();
  const ingestedTypes = new Set<string>();
  // Newest cumulative snapshot per umbrella type: the trended IS/BS statements
  // are cumulative, and on re-ingest the newest file wins the ON CONFLICT and
  // owns every period's rows (the read side keys per period from it). The
  // keeper is the ingested doc of that umbrella with the greatest period
  // ordinal (ties broken by doc_id) — it covers every earlier period.
  const authoritativeByCanon = new Map<string, { keeper: CoverageDocInput; maxOrd: number | null }>();
  for (const d of docs) {
    const ingested = d.extraction_status === 'success' && d.row_count > 0;
    if (!ingested) continue;
    if (d.primary_type && d.period) {
      const key = `${d.primary_type}|${d.period}`;
      if (!ingestedByContent.has(key)) ingestedByContent.set(key, d);
    }
    const stem = filenameStem(d.filename);
    if (stem && !ingestedByStem.has(stem)) ingestedByStem.set(stem, d);
    if (d.primary_type) ingestedTypes.add(d.primary_type);
    const canon = canonicalCoverageType(d.primary_type);
    if (canon) {
      const ord = periodOrdinal(d.period);
      const cur = authoritativeByCanon.get(canon);
      const better = !cur
        || (ord ?? -Infinity) > (cur.maxOrd ?? -Infinity)
        || ((ord ?? -Infinity) === (cur.maxOrd ?? -Infinity) && d.doc_id > cur.keeper.doc_id);
      if (better) authoritativeByCanon.set(canon, { keeper: d, maxOrd: ord });
    }
  }

  for (const d of docs) {
    if (d.extraction_status !== 'success') {
      result.set(d.doc_id, {
        status: 'extraction_failed',
        reason: `text extraction ${d.extraction_status || 'incomplete'}`,
        duplicate_of: null,
      });
      continue;
    }

    if (d.row_count > 0) {
      result.set(d.doc_id, { status: 'ingested', reason: null, duplicate_of: null });
      continue;
    }

    // No rows landed. Decide: duplicate (skip, not a failure) vs genuine miss.
    // (1) same type + period as an ingested doc (re-upload of the same data).
    if (d.primary_type && d.period) {
      const twin = ingestedByContent.get(`${d.primary_type}|${d.period}`);
      if (twin && twin.doc_id !== d.doc_id) {
        result.set(d.doc_id, {
          status: 'skipped_duplicate',
          reason: `duplicate of doc #${twin.doc_id} (${twin.filename})`,
          duplicate_of: twin.doc_id,
        });
        continue;
      }
    }

    // (1b) Superseded by the newest cumulative trended statement of its umbrella
    // type. A monthly Trended IS/BS (or its GL-detail / SIE inputs, or a full-year
    // trend rollup) parses fine but its period rows are re-attributed to the newest
    // snapshot on re-ingest, so it lands 0 rows here. That is supersession, not a
    // parse failure — demote to a duplicate pointing at the authoritative keeper.
    // The ordinal guard keeps a genuinely NEWER file that failed as not_ingested:
    // it is only a duplicate when the keeper's period covers this doc's period.
    const canon = canonicalCoverageType(d.primary_type);
    if (canon) {
      const auth = authoritativeByCanon.get(canon);
      if (auth && auth.keeper.doc_id !== d.doc_id) {
        const dOrd = periodOrdinal(d.period);
        const covered = dOrd === null || auth.maxOrd === null || dOrd <= auth.maxOrd;
        if (covered) {
          result.set(d.doc_id, {
            status: 'skipped_duplicate',
            reason: `superseded by doc #${auth.keeper.doc_id} (${auth.keeper.filename}) — newest trended ${canon} covers ${d.period ?? 'all periods'}`,
            duplicate_of: auth.keeper.doc_id,
          });
          continue;
        }
      }
    }

    // (2) PDF twin of an ingested xlsx/csv with the same filename stem.
    const isPdf = /\.pdf$/i.test(d.filename);
    if (isPdf) {
      const stemTwin = ingestedByStem.get(filenameStem(d.filename));
      if (stemTwin && stemTwin.doc_id !== d.doc_id) {
        result.set(d.doc_id, {
          status: 'skipped_duplicate',
          reason: `duplicate of doc #${stemTwin.doc_id} (${stemTwin.filename}, PDF twin)`,
          duplicate_of: stemTwin.doc_id,
        });
        continue;
      }
    }

    // (3) full-year rollup while monthly docs of the same type already ingested.
    if (isFullYearRollup(d.filename) && d.primary_type && ingestedTypes.has(d.primary_type)) {
      result.set(d.doc_id, {
        status: 'skipped_duplicate',
        reason: 'full-year rollup (covered by monthly docs)',
        duplicate_of: null,
      });
      continue;
    }

    // Genuine miss. parse_error = a handler matched but produced 0 rows;
    // no_handler = nothing recognized the file. Both are surfaced explicitly.
    result.set(d.doc_id, {
      status: 'not_ingested',
      reason: d.handler_matched ? 'parse_error' : 'no_handler',
      duplicate_of: null,
    });
  }

  return result;
}
