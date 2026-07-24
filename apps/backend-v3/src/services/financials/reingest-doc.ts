/**
 * Re-ingest a single Vault document's already-extracted text through ALL four
 * financial parsers (KPI / Balance Sheet / Cost Detail / SIE) and upsert the
 * results into the financial tables.
 *
 * WHY THIS EXISTS: financial ingest historically only ran inside POST
 * /v3/vault/upload, so a statement uploaded before that logic existed — or one
 * whose extract failed at upload time — could never be ingested without a full
 * re-upload. This helper makes ingest REPEATABLE: any financial doc can be
 * re-ingested on demand (from the re-extract endpoint or a dedicated route).
 *
 * All four ingest functions upsert on natural keys (source/period/... ) so
 * running this repeatedly is idempotent and never double-counts. The same
 * parser-selection heuristics as the backfill script are used so the right
 * parser(s) fire per document type. A document may legitimately match more than
 * one parser (e.g. an FS-detail PDF containing both an income statement and a
 * balance sheet); each parser is the authority on whether it yields rows.
 */

import { llmRouter } from '../../lib/llm-router.js';
import { logger } from '../../lib/logger.js';
import {
  ingestFinancialRows,
  ingestBalanceSheetRows,
  ingestCostDetailRows,
  ingestSieRows,
  ingestApRows,
  ingestArRows,
  ingestTrialBalanceRows,
  ingestProjectRevenueRows,
  ingestProjectCostPoolRows,
  ingestServiceCenterRows,
  ingestPoolRateRows,
  assessAgingBatch,
} from './ingest.js';
import {
  parseAgedAr,
  parseOpenAp,
  parseTrialBalance,
  parseTrendSie,
  parseProjectRevenueSummary,
  parseRevenueSummaryByCostPool,
  parseProjectActualsTargets,
  parseTrendedStatement,
  parseServiceCenterGlDetail,
  parsePoolRateSummary,
  sanitizeExtractedText,
} from './deterministic-parsers.js';

/**
 * Per-document parser routing flags. One boolean per financial doc type. A doc
 * may legitimately match more than one (e.g. an FS-detail PDF that contains both
 * an income statement and a balance sheet), but a specialized type (AR / AP /
 * Trial Balance / SIE / Cost Detail / Project Revenue / Balance Sheet) is
 * mutually exclusive with the generic P&L parser: see `is_financial` below.
 */
export interface FinancialDocClassification {
  is_financial: boolean;
  is_balance_sheet: boolean;
  is_cost_detail: boolean;
  is_sie: boolean;
  is_ap: boolean;
  is_ar: boolean;
  is_trial_balance: boolean;
  is_project_revenue: boolean;
  /**
   * Per-contract "Revenue Summary by Cost Pool" book — the authoritative FY
   * per-contract actuals source (Revenue / Total Direct + Indirect / Op Income /
   * Op Profit %). Distinct from the 29-column "Full Proj Revenue Summary" ITD
   * book (is_project_revenue), which ships empty actuals. Mutually exclusive with
   * is_project_revenue so the cost-pool book never falls through to the ITD
   * parser / LLM.
   */
  is_project_cost_pool: boolean;
  /**
   * YTD GL Detail routed to the Cost Service Centers parser (INDIRECT side).
   * A GL Detail also matches is_cost_detail; that overlap is fine — the two
   * parsers read different slices and neither is the generic P&L parser.
   */
  is_gl_service_center: boolean;
  /** L2/L1 ACTUAL & TARGET company P&L (DataSetLandTbl "Period Cost/Prof/Rev"). */
  is_project_actuals_targets: boolean;
  /**
   * Trended Income Statement / Trended Balance Sheet — recognized by the
   * structural fingerprint (an "Account Name | Jan | Feb | ..." month grid with
   * Total Direct Costs / Total Cost of Operations, or Total Assets / Total
   * Equity), NOT by filename. This is the authoritative, reconcilable source for
   * per-month Total Direct Costs and Total Cost of Operations, so it is handled
   * by the deterministic parseTrendedStatement path and SUPPRESSES the generic
   * KPI / cost_detail / SIE / balance-sheet parsers for the same doc.
   */
  is_income_statement: boolean;
}

/**
 * Decide which financial parser(s) a document should be routed to.
 *
 * WHY THIS EXISTS: the previous routing was filename-only and the P&L gate
 * (`/financ|...|proj|revenue|.../`) matched any file with "proj" or "revenue" in
 * its name — so a "Full Proj Revenue Summary" file was ALSO run through
 * `financial_statement_extract`, which rejected every row ("implausible
 * financial row — not stored") and produced log noise, while the file's own
 * project-revenue rows depended on a separate, brittle filename check. The same
 * brittleness meant a doc whose filename didn't carry the exact token never
 * reached its correct parser at all.
 *
 * The fix routes by EITHER signal:
 *   (a) a filename keyword, OR
 *   (b) a header-signature sniff of the extracted text head.
 * A doc routes to a specialized parser when either matches. The generic P&L
 * parser (`is_financial`) is then SUPPRESSED whenever any specialized type
 * matched, so non-P&L docs are never fed to `financial_statement_extract`.
 *
 * The content head is normalized (lowercased, `_x000D_` and newlines collapsed
 * to spaces) so header cells that ExcelJS splits across lines — e.g. the Trial
 * Balance "Prior Period(s)\nYTD Activity ... Ending Balance" cell — still match.
 */
export function classifyFinancialDoc(
  filename: string,
  extractedText: string,
  docType?: string | null,
): FinancialDocClassification {
  const fn = filename || '';
  const head = (extractedText || '').slice(0, 2000);
  const headNorm = head
    .toLowerCase()
    .replace(/_x000d_/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // --- Specialized types: filename keyword OR header-signature content sniff ---

  // Bug 2: L2/L1 ACTUAL & TARGET company P&L files (sheet DataSetLandTbl). The
  // header cells are ExcelJS RichText and render as "[object Object]", so this is
  // keyed on the filename token (e.g. "L2 - ACTUAL", "L1-TARGET"). This MUST win
  // over is_project_revenue: an "L1-ACTUAL Proj Revenue Summary" is this 7-column
  // company format, NOT the 29-column project-revenue ITD format.
  const is_project_actuals_targets = /\bl[12]\b[\s-]*(actual|target)/i.test(fn);

  // The per-contract "Revenue Summary by Cost Pool" book — real monthly actuals
  // per contract, one sheet per fiscal period. Recognised by the filename or by
  // its own header signature (L2 Proj ID + Op Income-ACT + Total Indirect-ACT).
  // This MUST win over is_project_revenue: its filename also matches
  // "revenue.*summary", but it is NOT the 29-column ITD format.
  const is_project_cost_pool =
    !is_project_actuals_targets &&
    (/revenue.?summary.?by.?cost.?pool|cost.?pool/i.test(fn) ||
      (/l2 proj id/.test(headNorm) &&
        /op income-act/.test(headNorm) &&
        /total indirect-act/.test(headNorm)));

  const is_project_revenue =
    !is_project_actuals_targets &&
    !is_project_cost_pool &&
    (/proj.*revenue|revenue.*summary|full.?proj/i.test(fn) ||
      (/revenue project/.test(headNorm) && /\bitd\b/.test(headNorm)));

  const is_trial_balance =
    /trial.?balance|trail.?balance/i.test(fn) ||
    (/account/.test(headNorm) &&
      /beginning balance/.test(headNorm) &&
      /ending balance/.test(headNorm));

  // A Balance Sheet is recognised by filename OR by its own structural markers
  // (the "As of ... Assets ... Liabilities & Equity" spine), NOT by the mere
  // presence of the phrase "balance sheet" or "accounts payable" — those appear
  // as LINE ITEMS inside statements that are not balance sheets.
  const is_balance_sheet =
    /balance.?sheet/i.test(fn) ||
    /balance.?sheet/i.test(head) ||
    (/liabilities & equity/.test(headNorm) &&
      /total (current )?assets/.test(headNorm));

  const is_sie =
    /\bsie\b|statement.?of.?indirect|trend.?rate|trend.?sie/i.test(fn) ||
    /indirect.?expense/.test(headNorm) ||
    ((/pool number/.test(headNorm) || /pool name/.test(headNorm)) &&
      (/wrap rate/.test(headNorm) || /trend rate/.test(headNorm) || /\bact\b/.test(headNorm)));

  // AR / AP are recognised by an AP/AR-report FILENAME or by the report's own
  // structural header signature (AR: customer + invoice + aging; AP: vendor +
  // voucher). They are NOT inferred from the bare phrases "accounts receivable"
  // / "accounts payable", which occur as line items in every Balance Sheet and
  // Trial Balance — that loose match is exactly what routed the June Balance
  // Sheet into ap_actuals. A Balance Sheet / Trial Balance is never an AR/AP
  // report, so those types hard-suppress AR/AP.
  const rawIsAr =
    /aged.?ar|accounts?.?receivable/i.test(fn) ||
    (/customer/.test(headNorm) &&
      /invoice/.test(headNorm) &&
      /(due date|31 to 60|61 to 90|over 90|current)/.test(headNorm));
  const is_ar = rawIsAr && !is_balance_sheet && !is_trial_balance;

  const rawIsAp =
    /\bap\b|accounts?.?payable|open.?ap/i.test(fn) ||
    (/vendor/.test(headNorm) && /voucher/.test(headNorm));
  const is_ap = rawIsAp && !is_balance_sheet && !is_trial_balance;

  const is_cost_detail =
    /tgt.?vs.?act|target.?vs.?actual|cost.?detail|gl.?detail|ytd.?gl/i.test(fn) ||
    /cost.?detail|gl.?detail/i.test(head) ||
    /proj classification/.test(headNorm);

  // A YTD GL Detail ledger — recognised by the GL filename or its Proj
  // Classification header — feeds the Cost Service Centers parser (INDIRECT rows
  // aggregated per service center). This is a slice of the same GL doc that
  // is_cost_detail matches; both may be true.
  const is_gl_service_center =
    /gl.?detail|ytd.?gl/i.test(fn) ||
    /proj classification/.test(headNorm);

  // Trended Income Statement structural fingerprint (content, not filename): an
  // "Account Name | Jan | Feb | Mar | ..." month grid together with the Total
  // Direct Costs / Total Cost of Operations F/S subtotals. Scanned over a wide
  // window because the SUMMARY header + subtotals sit in the first sheet. The
  // filename is only a weak confirmation — a renamed file still fingerprints.
  const bodyNorm = (extractedText || '')
    .slice(0, 8000)
    .toLowerCase()
    .replace(/_x000d_/gi, ' ')
    .replace(/\s+/g, ' ');
  const hasMonthGrid =
    /account name.*\bjan\b.*\bfeb\b.*\bmar\b/.test(bodyNorm) ||
    /\bjan\b.{0,6}\bfeb\b.{0,6}\bmar\b.{0,6}\bapr\b/.test(bodyNorm);
  const hasIsTotals =
    /total direct costs/.test(bodyNorm) || /total cost of operations/.test(bodyNorm);
  // Trended Balance Sheet fingerprint (same month grid, different subtotals). The
  // deterministic parseTrendedStatement handles both kinds and self-identifies,
  // so both feed the same is_income_statement route.
  const hasBsTotals =
    (/total current assets/.test(bodyNorm) && /total current liabilities/.test(bodyNorm)) ||
    /liabilities & equity/.test(bodyNorm) ||
    /trended balance sheet/.test(bodyNorm);
  const is_income_statement =
    hasMonthGrid && (hasIsTotals || hasBsTotals) && !is_ap && !is_ar && !is_trial_balance;

  const anySpecialized =
    is_balance_sheet ||
    is_cost_detail ||
    is_sie ||
    is_ap ||
    is_ar ||
    is_trial_balance ||
    is_project_revenue ||
    is_project_cost_pool ||
    is_gl_service_center ||
    is_project_actuals_targets ||
    is_income_statement;

  // Generic P&L / KPI parser. The keyword set is intentionally broad (it must
  // catch L1-TARGET / L1-ACTUAL income statements), but it is gated on
  // `!anySpecialized` so it NEVER fires on a doc that already matched a
  // specialized type — that gate is the core of the fix.
  const looksFinancialKeyword =
    /financ|p&l|income|balance|budget|forecast|tgt|target|plan|proj|revenue|\bact\b/i.test(fn);
  const is_financial = (looksFinancialKeyword || docType === 'financial') && !anySpecialized;

  return {
    is_financial,
    is_balance_sheet,
    is_cost_detail,
    is_sie,
    is_ap,
    is_ar,
    is_trial_balance,
    is_project_revenue,
    is_project_cost_pool,
    is_gl_service_center,
    is_project_actuals_targets,
    is_income_statement,
  };
}

export interface ReingestResult {
  plan: number;
  actual: number;
  rejected: number;
  balance_sheet: number;
  cost_detail: number;
  sie: number;
  ap: number;
  ar: number;
  trial_balance: number;
  project_revenue: number;
  project_cost_pool: number;
  service_center: number;
  pool_rate: number;
  income_statement: number;
  parsers_run: string[];
  parsers_skipped: string[];
  any_ingested: boolean;
  parse_warnings: string[];
}

/**
 * Run the relevant financial parsers against a doc's extracted text and ingest.
 * `docType === 'financial'` forces the KPI parser to run even when the filename
 * carries no financial token (mirrors the upload gate). Balance-sheet / cost /
 * SIE selection is by filename + a peek at the text head, same as the backfill.
 */
export async function reingestFinancialDoc(params: {
  docId: number;
  filename: string;
  extractedText: string;
  docType?: string | null;
  skipParsers?: string[];
}): Promise<ReingestResult> {
  const { docId, filename, extractedText, docType } = params;
  // Working set of parsers to skip. The deterministic Trended-statement branch
  // adds to this at runtime so the generic KPI / cost_detail / SIE / balance-sheet
  // parsers never re-process a doc the trended parser already authoritatively
  // ingested (which would double-write stale tgt_vs_act / sie dollars).
  const skipParsers = [...(params.skipParsers ?? [])];

  const result: ReingestResult = {
    plan: 0,
    actual: 0,
    rejected: 0,
    balance_sheet: 0,
    cost_detail: 0,
    sie: 0,
    ap: 0,
    ar: 0,
    trial_balance: 0,
    project_revenue: 0,
    project_cost_pool: 0,
    service_center: 0,
    pool_rate: 0,
    income_statement: 0,
    parsers_run: [],
    parsers_skipped: [],
    any_ingested: false,
    parse_warnings: [],
  };

  if (!extractedText || extractedText.trim().length === 0) {
    return result;
  }

  // Route by filename keyword OR header-signature content sniff. Specialized
  // types suppress the generic P&L parser so non-P&L docs are never fed to
  // financial_statement_extract (which would reject every row as "implausible").
  const cls = classifyFinancialDoc(filename, extractedText, docType);

  // Dedup guard: the aging/grid tabular reports (AP / AR / Trial Balance /
  // Project Revenue) are frequently uploaded as BOTH a machine-readable .xlsx
  // and a rendered .pdf of the same report+period. The .xlsx is the authoritative
  // structured source; the .pdf re-flows columns and parses unreliably, and when
  // both are ingested their rows do not collide on the natural key (parse
  // variance in names/invoice numbers), so the period DOUBLE-COUNTS — this is
  // what made June AR read ~$6.3M instead of $3.18M and fed the mis-parsed June
  // AP .pdf. For these four types we skip the .pdf and defer to the .xlsx,
  // flagging it as NEEDS_REVIEW so a period that only has a PDF is surfaced (and
  // can be re-uploaded as .xlsx) rather than silently corrupting the totals.
  const isPdf = /\.pdf$/i.test(filename);
  const skipTabularPdf =
    isPdf &&
    (cls.is_ap ||
      cls.is_ar ||
      cls.is_trial_balance ||
      cls.is_project_revenue ||
      cls.is_project_cost_pool);

  // --- Parser 0: Trended Income Statement / Trended Balance Sheet ---
  // This runs FIRST and is the authoritative, reconcilable source for per-month
  // Total Direct Costs (cost_detail, source income_statement) and Total Cost of
  // Operations (indirect, source income_statement). When it yields rows it
  // suppresses the generic KPI / cost_detail / SIE (income statement) or
  // balance_sheet (balance sheet) parsers for the SAME doc so they cannot
  // re-write the stale tgt_vs_act / sie dollars over the good numbers.
  if (cls.is_income_statement && !skipParsers.includes('income_statement_extract')) {
    try {
      const trended = parseTrendedStatement(extractedText, filename);
      if (trended && trended.kind === 'income_statement') {
        result.parsers_run.push('income_statement_extract (deterministic)');
        let ingested = 0;
        if (trended.costDetail.length > 0) {
          result.cost_detail += await ingestCostDetailRows(trended.costDetail, docId, 'income_statement');
          ingested += trended.costDetail.length;
        }
        if (trended.sie.length > 0) {
          result.sie += await ingestSieRows(trended.sie, docId, 'income_statement');
          ingested += trended.sie.length;
        }
        if (trended.financial.length > 0) {
          const counts = await ingestFinancialRows(trended.financial, docId);
          result.actual += counts.actual;
          result.plan += counts.plan;
          result.rejected += counts.rejected;
          if (counts.parse_warnings.length > 0) result.parse_warnings.push(...counts.parse_warnings);
          ingested += counts.actual + counts.plan;
        }
        result.income_statement = ingested;
        if (ingested > 0) {
          result.any_ingested = true;
          // Suppress the LLM/legacy parsers that would otherwise overwrite the
          // authoritative income_statement rows with stale dollars.
          skipParsers.push('financial_statement_extract', 'cost_detail_extract', 'sie_extract');
        } else {
          result.parse_warnings.push('income_statement_extract: 0 rows (trended grid detected but no month data)');
        }
      } else if (trended && trended.kind === 'balance_sheet') {
        result.parsers_run.push('income_statement_extract (deterministic balance sheet)');
        if (trended.balanceSheet.length > 0) {
          result.balance_sheet += await ingestBalanceSheetRows(trended.balanceSheet, docId);
          result.income_statement = trended.balanceSheet.length;
          if (result.balance_sheet > 0) {
            result.any_ingested = true;
            skipParsers.push('balance_sheet_extract', 'financial_statement_extract');
          }
        }
      } else {
        logger.warn({ docId, filename }, 'reingest: income_statement fingerprint matched but parseTrendedStatement returned null');
        result.parse_warnings.push('income_statement_extract: fingerprint matched but grid not parseable');
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: Trended statement parser failed');
      result.parse_warnings.push('income_statement_extract: parser threw');
    }
  }

  // --- Parser 1: KPI (Income Statement / L1-TARGET / L1-ACTUAL) ---
  if (cls.is_financial && !skipParsers.includes('financial_statement_extract')) {
    try {
      const finResult = await llmRouter.route({
        task: 'financial_statement_extract' as const,
        input: { filename, extracted_text: extractedText },
      });
      result.parsers_run.push('financial_statement_extract');
      if (finResult.ok && finResult.output.is_financial && finResult.output.rows.length > 0) {
        const counts = await ingestFinancialRows(finResult.output.rows, docId);
        result.plan = counts.plan;
        result.actual = counts.actual;
        result.rejected = counts.rejected;
        if (counts.parse_warnings.length > 0) result.parse_warnings.push(...counts.parse_warnings);
        if (counts.plan > 0 || counts.actual > 0) result.any_ingested = true;
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: KPI parser failed');
    }
  }

  // --- Parser 2: Balance Sheet ---
  if (cls.is_balance_sheet && !skipParsers.includes('balance_sheet_extract')) {
    try {
      const bsResult = await llmRouter.route({
        task: 'balance_sheet_extract' as const,
        input: { filename, extracted_text: extractedText },
      });
      result.parsers_run.push('balance_sheet_extract');
      if (bsResult.ok && bsResult.output.is_balance_sheet && bsResult.output.rows.length > 0) {
        result.balance_sheet = await ingestBalanceSheetRows(bsResult.output.rows, docId);
        if (result.balance_sheet > 0) result.any_ingested = true;
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: balance sheet parser failed');
    }
  }

  // --- Parser 3: Cost Detail (TGT vs ACT / YTD GL Detail) — DISABLED ---
  // TGT vs ACT and YTD GL Detail files are year-to-date CUMULATIVE and only cover
  // the months that have a monthly GL export; storing their figures as per-month
  // cost_detail double-counts against the prior months and leaves later months
  // empty. The deterministic Trended Income Statement (Parser 0, source
  // income_statement) is the single authoritative, reconcilable monthly source for
  // direct costs, so tgt_vs_act / GL docs no longer write cost_detail_actuals. The
  // same docs still feed the indirect (SIE) and KPI parsers below.
  if (cls.is_cost_detail && !skipParsers.includes('cost_detail_extract')) {
    result.parse_warnings.push(
      'cost_detail_extract: skipped — tgt_vs_act/GL no longer feed cost_detail (income_statement is authoritative)',
    );
  }

  // --- Parser 3b: Cost Service Centers (YTD GL Detail, INDIRECT side) ---
  // Aggregates the GL Detail's INDIRECT postings into per-service-center monthly
  // cost (service_center_actuals). Deterministic-only: the GL Detail is a
  // structured ledger, so there is no LLM fallback. Snapshot-replaces the fiscal
  // year, so a re-ingest self-cleans.
  if (cls.is_gl_service_center && !skipParsers.includes('service_center_extract')) {
    try {
      const detSc = parseServiceCenterGlDetail(extractedText, filename);
      if (detSc && detSc.rows.length > 0) {
        result.parsers_run.push('service_center_extract (deterministic)');
        result.service_center = await ingestServiceCenterRows(detSc.rows, docId);
        if (result.service_center > 0) result.any_ingested = true;
      } else {
        result.parse_warnings.push('service_center_extract: 0 INDIRECT rows (not a GL Detail ledger, or no indirect postings)');
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: service-center parser failed');
    }
  }

  // --- Parser 4: SIE (Statement of Indirect Expenses / Trend Rate Summary) ---
  // The Trend SIE workbook also carries the top "Trend Rate Summary" pool rates,
  // which drive the Cost Service Centers rate strip. Parse + ingest those first;
  // it is independent of the pool-detail SIE rows below.
  if (cls.is_sie && !skipParsers.includes('pool_rate_extract')) {
    try {
      const detRates = parsePoolRateSummary(extractedText, filename);
      if (detRates && detRates.rows.length > 0) {
        result.parsers_run.push('pool_rate_extract (deterministic)');
        result.pool_rate = await ingestPoolRateRows(detRates.rows, docId);
        if (result.pool_rate > 0) result.any_ingested = true;
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: pool-rate parser failed');
    }
  }

  if (cls.is_sie && !skipParsers.includes('sie_extract')) {
    try {
      // Try deterministic Trend SIE parser first
      const detSie = parseTrendSie(extractedText, filename);
      if (detSie && detSie.rows.length > 0) {
        result.parsers_run.push('sie_extract (deterministic)');
        result.sie = await ingestSieRows(detSie.rows, docId);
        if (result.sie > 0) result.any_ingested = true;
      } else {
        // Fallback to LLM parser
        const sieResult = await llmRouter.route({
          task: 'sie_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('sie_extract');
        if (sieResult.ok && sieResult.output.is_sie && sieResult.output.rows.length > 0) {
          result.sie = await ingestSieRows(sieResult.output.rows, docId);
          if (result.sie > 0) result.any_ingested = true;
        } else {
          logger.warn({ docId, filename, is_sie: sieResult.ok ? sieResult.output.is_sie : false }, 'reingest: sie_extract returned 0 rows — header/row detection failed');
          result.parse_warnings.push('sie_extract: 0 rows (header/row detection failed)');
        }
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: SIE parser failed');
    }
  }

  // --- Parser 5: AP (Open Accounts Payable) ---
  if (cls.is_ap && skipTabularPdf) {
    result.parse_warnings.push(
      'ap_extract: skipped PDF of a tabular AP report — the .xlsx is authoritative; upload/keep the .xlsx for accurate ingest.',
    );
  } else if (cls.is_ap && !skipParsers.includes('ap_extract')) {
    try {
      // Try deterministic AP parser first (handles _x000D_ headers and grouped vendors)
      const detAp = parseOpenAp(extractedText, filename);
      if (detAp && detAp.rows.length > 0) {
        const warn = assessAgingBatch('AP', detAp.rows);
        if (warn) {
          // Snapshot-replace ingest deletes the period before writing, so an
          // implausible parse must NOT be persisted — it would overwrite good
          // rows with garbage. Flag for human review and leave existing rows.
          result.parse_warnings.push(warn);
          result.parsers_skipped.push('ap_extract (implausible batch — not written to protect existing data)');
        } else {
          result.parsers_run.push('ap_extract (deterministic)');
          result.ap = await ingestApRows(detAp.rows, docId);
          if (result.ap > 0) result.any_ingested = true;
        }
      } else {
        // Fallback to LLM parser
        const apResult = await llmRouter.route({
          task: 'ap_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('ap_extract');
        if (apResult.ok && apResult.output.is_ap && apResult.output.rows.length > 0) {
          const warn = assessAgingBatch('AP', apResult.output.rows);
          if (warn) {
            result.parse_warnings.push(warn);
            result.parsers_skipped.push('ap_extract (implausible batch — not written to protect existing data)');
          } else {
            result.ap = await ingestApRows(apResult.output.rows, docId);
            if (result.ap > 0) result.any_ingested = true;
          }
        } else {
          logger.warn({ docId, filename, is_ap: apResult.ok ? apResult.output.is_ap : false }, 'reingest: ap_extract returned 0 rows — header/row detection failed (check for _x000D_ in headers or grouped vendor rows)');
          result.parse_warnings.push('ap_extract: 0 rows (header/row detection failed)');
        }
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: AP parser failed');
    }
  }

  // --- Parser 6: AR (Aged Accounts Receivable) ---
  if (cls.is_ar && skipTabularPdf) {
    result.parse_warnings.push(
      'ar_extract: skipped PDF of a tabular AR report — the .xlsx is authoritative; upload/keep the .xlsx for accurate ingest.',
    );
  } else if (cls.is_ar && !skipParsers.includes('ar_extract')) {
    try {
      // Try deterministic AR parser first (handles grouped customer rows)
      const detAr = parseAgedAr(extractedText, filename);
      if (detAr && detAr.rows.length > 0) {
        const warn = assessAgingBatch('AR', detAr.rows);
        if (warn) {
          result.parse_warnings.push(warn);
          result.parsers_skipped.push('ar_extract (implausible batch — not written to protect existing data)');
        } else {
          result.parsers_run.push('ar_extract (deterministic)');
          result.ar = await ingestArRows(detAr.rows, docId);
          if (result.ar > 0) result.any_ingested = true;
        }
      } else {
        // Fallback to LLM parser
        const arResult = await llmRouter.route({
          task: 'ar_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('ar_extract');
        if (arResult.ok && arResult.output.is_ar && arResult.output.rows.length > 0) {
          const warn = assessAgingBatch('AR', arResult.output.rows);
          if (warn) {
            result.parse_warnings.push(warn);
            result.parsers_skipped.push('ar_extract (implausible batch — not written to protect existing data)');
          } else {
            result.ar = await ingestArRows(arResult.output.rows, docId);
            if (result.ar > 0) result.any_ingested = true;
          }
        } else {
          logger.warn({ docId, filename, is_ar: arResult.ok ? arResult.output.is_ar : false }, 'reingest: ar_extract returned 0 rows — header/row detection failed (check for grouped customer rows with blank Customer column)');
          result.parse_warnings.push('ar_extract: 0 rows (header/row detection failed)');
        }
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: AR parser failed');
    }
  }

  // --- Parser 7: Trial Balance ---
  if (cls.is_trial_balance && skipTabularPdf) {
    result.parse_warnings.push(
      'trial_balance_extract: skipped PDF of a tabular Trial Balance — the .xlsx is authoritative; upload/keep the .xlsx for accurate ingest.',
    );
  } else if (cls.is_trial_balance && !skipParsers.includes('trial_balance_extract')) {
    try {
      // Try deterministic TB parser first (handles Beginning/Prior/Current/Ending format)
      const detTb = parseTrialBalance(extractedText, filename);
      if (detTb && detTb.rows.length > 0) {
        result.parsers_run.push('trial_balance_extract (deterministic)');
        result.trial_balance = await ingestTrialBalanceRows(detTb.rows, docId);
        if (result.trial_balance > 0) result.any_ingested = true;
      } else {
        // Fallback to LLM parser
        const tbResult = await llmRouter.route({
          task: 'trial_balance_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('trial_balance_extract');
        if (tbResult.ok && tbResult.output.is_trial_balance && tbResult.output.rows.length > 0) {
          result.trial_balance = await ingestTrialBalanceRows(tbResult.output.rows, docId);
          if (result.trial_balance > 0) result.any_ingested = true;
        } else {
          logger.warn({ docId, filename, is_trial_balance: tbResult.ok ? tbResult.output.is_trial_balance : false }, 'reingest: trial_balance_extract returned 0 rows — this file uses Beginning/Prior/Current/Ending Balance columns, not debit/credit');
          result.parse_warnings.push('trial_balance_extract: 0 rows (header/row detection failed)');
        }
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: Trial Balance parser failed');
    }
  }

  // --- Parser 8: Project Revenue Summary ---
  if (cls.is_project_revenue && skipTabularPdf) {
    result.parse_warnings.push(
      'project_revenue_extract: skipped PDF of a tabular Project Revenue report — the .xlsx is authoritative; upload/keep the .xlsx for accurate ingest.',
    );
  } else if (cls.is_project_revenue && !skipParsers.includes('project_revenue_extract')) {
    try {
      // Try deterministic parser first (handles 29-col ITD format)
      const detPr = parseProjectRevenueSummary(extractedText, filename);
      if (detPr && detPr.rows.length > 0) {
        result.parsers_run.push('project_revenue_extract (deterministic)');
        result.project_revenue = await ingestProjectRevenueRows(detPr.rows, docId);
        if (result.project_revenue > 0) result.any_ingested = true;
      } else {
        // Fallback to LLM parser
        const prResult = await llmRouter.route({
          task: 'project_revenue_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('project_revenue_extract');
        if (prResult.ok && prResult.output.is_project_revenue && prResult.output.rows.length > 0) {
          result.project_revenue = await ingestProjectRevenueRows(prResult.output.rows, docId);
          if (result.project_revenue > 0) result.any_ingested = true;
        } else {
          logger.warn({ docId, filename, is_project_revenue: prResult.ok ? prResult.output.is_project_revenue : false }, 'reingest: project_revenue_extract returned 0 rows — expected 29-col ITD format with Revenue Project (ID)/(name) headers');
          result.parse_warnings.push('project_revenue_extract: 0 rows (header/row detection failed)');
        }
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: Project Revenue parser failed');
    }
  }

  // --- Parser 8b: Per-contract Revenue Summary by Cost Pool ---
  // The authoritative per-contract actuals book (real monthly revenue / burdened
  // cost / Op Income / margin). Deterministic-only — no LLM fallback, since the
  // format is fixed and an LLM pass here previously produced the mislabeled
  // single-"FY26 Jun" rollup rows.
  if (cls.is_project_cost_pool && skipTabularPdf) {
    result.parse_warnings.push(
      'project_cost_pool_extract: skipped PDF of a tabular Revenue Summary by Cost Pool report — the .xlsx is authoritative; upload/keep the .xlsx for accurate ingest.',
    );
  } else if (cls.is_project_cost_pool && !skipParsers.includes('project_cost_pool_extract')) {
    try {
      const detCp = parseRevenueSummaryByCostPool(extractedText, filename);
      if (detCp && detCp.rows.length > 0) {
        result.parsers_run.push('project_cost_pool_extract (deterministic)');
        result.project_cost_pool = await ingestProjectCostPoolRows(detCp.rows, docId);
        if (result.project_cost_pool > 0) result.any_ingested = true;
      } else {
        logger.warn({ docId, filename }, 'reingest: project_cost_pool returned 0 rows — expected sheets with FY | Pd | L2 Proj ID | Revenue | Total Direct Cost | Total Indirect-ACT | Op Income-ACT headers');
        result.parse_warnings.push('project_cost_pool_extract: 0 rows (header/row detection failed)');
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: Project Cost Pool parser failed');
    }
  }

  // --- Parser 9: L2/L1 ACTUAL & TARGET company P&L (Bug 2) ---
  if (cls.is_project_actuals_targets && !skipParsers.includes('project_actuals_targets_extract')) {
    try {
      const patResult = parseProjectActualsTargets(extractedText, filename);
      if (patResult && patResult.rows.length > 0) {
        result.parsers_run.push('project_actuals_targets_extract (deterministic)');
        const counts = await ingestFinancialRows(patResult.rows, docId);
        result.plan += counts.plan;
        result.actual += counts.actual;
        result.rejected += counts.rejected;
        if (counts.parse_warnings.length > 0) result.parse_warnings.push(...counts.parse_warnings);
        if (counts.plan > 0 || counts.actual > 0) result.any_ingested = true;
      } else {
        logger.warn({ docId, filename }, 'reingest: project_actuals_targets returned 0 rows — expected DataSetLandTbl with per-project Period Cost/Profit/Revenue columns');
        result.parse_warnings.push('project_actuals_targets_extract: 0 rows (header/row detection failed)');
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: Project Actuals/Targets parser failed');
    }
  }

  // Populate parsers_skipped: any parser whose heuristic didn't match.
  const allParsers = [
    { key: 'financial_statement_extract', matched: cls.is_financial },
    { key: 'balance_sheet_extract', matched: cls.is_balance_sheet },
    { key: 'cost_detail_extract', matched: cls.is_cost_detail },
    { key: 'sie_extract', matched: cls.is_sie },
    { key: 'ap_extract', matched: cls.is_ap },
    { key: 'ar_extract', matched: cls.is_ar },
    { key: 'trial_balance_extract', matched: cls.is_trial_balance },
    { key: 'project_revenue_extract', matched: cls.is_project_revenue },
    { key: 'project_cost_pool_extract', matched: cls.is_project_cost_pool },
    { key: 'project_actuals_targets_extract', matched: cls.is_project_actuals_targets },
    { key: 'income_statement_extract', matched: cls.is_income_statement },
  ];
  for (const p of allParsers) {
    if (!p.matched && !skipParsers.includes(p.key)) {
      result.parsers_skipped.push(p.key);
    }
  }

  return result;
}

/**
 * The explicit, human-facing outcome vocabulary (F-1142 Pillar 4). Every doc a
 * caller runs through the financial pipeline resolves to exactly one of these —
 * there is no silent warn-and-continue and no "no_handler" dead-end. SUPERSEDED
 * is a cross-doc verdict (a newer copy of the same content ingested) and is
 * decided by the coverage classifier, not here; FAILED is reserved for a thrown
 * parser (the caller's catch). This helper covers the single-doc outcomes.
 */
export type FinancialVerdict =
  | 'INGESTED'
  | 'NEEDS_REVIEW'
  | 'SKIPPED'
  | 'FAILED';

export interface VerdictResult {
  verdict: FinancialVerdict;
  detail: string;
}

/**
 * Map a single-doc ReingestResult to an explicit verdict + reason. Rows landed
 * -> INGESTED. No rows but a handler ran (parser attempted or emitted a warning)
 * -> NEEDS_REVIEW (a real parse gap a human must look at, never swallowed). No
 * rows and no handler even attempted -> SKIPPED (nothing financial recognized).
 */
export function computeVerdict(r: ReingestResult): VerdictResult {
  if (r.any_ingested) {
    const parts: string[] = [];
    if (r.income_statement > 0) parts.push(`income_statement=${r.income_statement}`);
    if (r.plan > 0) parts.push(`plan=${r.plan}`);
    if (r.actual > 0) parts.push(`actual=${r.actual}`);
    if (r.balance_sheet > 0) parts.push(`balance_sheet=${r.balance_sheet}`);
    if (r.cost_detail > 0) parts.push(`cost_detail=${r.cost_detail}`);
    if (r.sie > 0) parts.push(`sie=${r.sie}`);
    if (r.ap > 0) parts.push(`ap=${r.ap}`);
    if (r.ar > 0) parts.push(`ar=${r.ar}`);
    if (r.trial_balance > 0) parts.push(`trial_balance=${r.trial_balance}`);
    if (r.project_revenue > 0) parts.push(`project_revenue=${r.project_revenue}`);
    if (r.project_cost_pool > 0) parts.push(`project_cost_pool=${r.project_cost_pool}`);
    if (r.service_center > 0) parts.push(`service_center=${r.service_center}`);
    if (r.pool_rate > 0) parts.push(`pool_rate=${r.pool_rate}`);
    return { verdict: 'INGESTED', detail: parts.join(', ') || 'rows ingested' };
  }
  const handlerAttempted = r.parsers_run.length > 0 || r.parse_warnings.length > 0;
  if (handlerAttempted) {
    return {
      verdict: 'NEEDS_REVIEW',
      detail: r.parse_warnings.length > 0
        ? r.parse_warnings.join('; ')
        : `handler ran (${r.parsers_run.join(', ')}) but produced 0 rows`,
    };
  }
  return { verdict: 'SKIPPED', detail: 'no financial handler recognized this document' };
}
