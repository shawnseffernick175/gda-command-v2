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
} from './ingest.js';
import {
  parseAgedAr,
  parseOpenAp,
  parseTrialBalance,
  parseTrendSie,
  parseYtdGlDetail,
  parseProjectRevenueSummary,
} from './deterministic-parsers.js';

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
  const { docId, filename, extractedText, docType, skipParsers = [] } = params;

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
    parsers_run: [],
    parsers_skipped: [],
    any_ingested: false,
    parse_warnings: [],
  };

  if (!extractedText || extractedText.trim().length === 0) {
    return result;
  }

  const head = extractedText.slice(0, 2000);

  // --- Parser 1: KPI (Income Statement / L1-TARGET / L1-ACTUAL) ---
  // Same gate the upload route uses, plus the explicit doc_type=financial force.
  const looksFinancial =
    /financ|p&l|income|balance|budget|forecast|tgt|target|plan|proj|revenue|\bact\b/i.test(filename) ||
    docType === 'financial';
  if (looksFinancial && !skipParsers.includes('financial_statement_extract')) {
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
  const looksBalanceSheet = /balance.?sheet/i.test(filename) || /balance.?sheet/i.test(head);
  if (looksBalanceSheet && !skipParsers.includes('balance_sheet_extract')) {
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

  // --- Parser 3: Cost Detail (TGT vs ACT / YTD GL Detail) ---
  const looksCostDetail = /tgt.?vs.?act/i.test(filename) || /target.?vs.?actual/i.test(filename)
    || /cost.?detail|gl.?detail|ytd.?gl/i.test(filename) || /cost.?detail|gl.?detail/i.test(head);
  if (looksCostDetail && !skipParsers.includes('cost_detail_extract')) {
    try {
      // Try deterministic GL Detail parser first (handles large files)
      const detGl = parseYtdGlDetail(extractedText, filename);
      if (detGl && detGl.rows.length > 0) {
        result.parsers_run.push('cost_detail_extract (deterministic)');
        result.cost_detail = await ingestCostDetailRows(detGl.rows, docId);
        if (result.cost_detail > 0) result.any_ingested = true;
      } else {
        // Fallback to LLM parser
        const cdResult = await llmRouter.route({
          task: 'cost_detail_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('cost_detail_extract');
        if (cdResult.ok && cdResult.output.is_cost_detail && cdResult.output.rows.length > 0) {
          result.cost_detail = await ingestCostDetailRows(cdResult.output.rows, docId);
          if (result.cost_detail > 0) result.any_ingested = true;
        } else {
          logger.warn({ docId, filename, is_cost_detail: cdResult.ok ? cdResult.output.is_cost_detail : false }, 'reingest: cost_detail_extract returned 0 rows — header/row detection failed');
          result.parse_warnings.push('cost_detail_extract: 0 rows (header/row detection failed)');
        }
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: cost detail parser failed');
    }
  }

  // --- Parser 4: SIE (Statement of Indirect Expenses / Trend Rate Summary) ---
  const looksSie =
    /\bsie\b/i.test(filename) ||
    /statement.?of.?indirect/i.test(filename) ||
    /indirect.?expense/i.test(head) ||
    /trend.?rate|trend.?sie/i.test(filename);
  if (looksSie && !skipParsers.includes('sie_extract')) {
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
  const looksAp = /\bap\b|accounts?.?payable|open.?ap/i.test(filename) || /accounts?.?payable|open.?ap|\bap\b/i.test(head);
  if (looksAp && !skipParsers.includes('ap_extract')) {
    try {
      // Try deterministic AP parser first (handles _x000D_ headers and grouped vendors)
      const detAp = parseOpenAp(extractedText, filename);
      if (detAp && detAp.rows.length > 0) {
        result.parsers_run.push('ap_extract (deterministic)');
        result.ap = await ingestApRows(detAp.rows, docId);
        if (result.ap > 0) result.any_ingested = true;
      } else {
        // Fallback to LLM parser
        const apResult = await llmRouter.route({
          task: 'ap_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('ap_extract');
        if (apResult.ok && apResult.output.is_ap && apResult.output.rows.length > 0) {
          result.ap = await ingestApRows(apResult.output.rows, docId);
          if (result.ap > 0) result.any_ingested = true;
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
  const looksAr = /\bar\b|accounts?.?receivable|aged.?ar/i.test(filename) || /accounts?.?receivable|aged.?ar|\bar\b/i.test(head);
  if (looksAr && !skipParsers.includes('ar_extract')) {
    try {
      // Try deterministic AR parser first (handles grouped customer rows)
      const detAr = parseAgedAr(extractedText, filename);
      if (detAr && detAr.rows.length > 0) {
        result.parsers_run.push('ar_extract (deterministic)');
        result.ar = await ingestArRows(detAr.rows, docId);
        if (result.ar > 0) result.any_ingested = true;
      } else {
        // Fallback to LLM parser
        const arResult = await llmRouter.route({
          task: 'ar_extract' as const,
          input: { filename, extracted_text: extractedText },
        });
        result.parsers_run.push('ar_extract');
        if (arResult.ok && arResult.output.is_ar && arResult.output.rows.length > 0) {
          result.ar = await ingestArRows(arResult.output.rows, docId);
          if (result.ar > 0) result.any_ingested = true;
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
  const looksTrialBalance = /trial.?balance|trail.?balance/i.test(filename) || /trial.?balance|trail.?balance/i.test(head);
  if (looksTrialBalance && !skipParsers.includes('trial_balance_extract')) {
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
  const looksProjectRevenue = /proj.*revenue|revenue.*summary|full.?proj/i.test(filename) || /project.*revenue|revenue.*summary|full.?proj/i.test(head);
  if (looksProjectRevenue && !skipParsers.includes('project_revenue_extract')) {
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

  // Populate parsers_skipped: any parser whose heuristic didn't match.
  const allParsers = [
    { key: 'financial_statement_extract', matched: looksFinancial },
    { key: 'balance_sheet_extract', matched: looksBalanceSheet },
    { key: 'cost_detail_extract', matched: looksCostDetail },
    { key: 'sie_extract', matched: looksSie },
    { key: 'ap_extract', matched: looksAp },
    { key: 'ar_extract', matched: looksAr },
    { key: 'trial_balance_extract', matched: looksTrialBalance },
    { key: 'project_revenue_extract', matched: looksProjectRevenue },
  ];
  for (const p of allParsers) {
    if (!p.matched && !skipParsers.includes(p.key)) {
      result.parsers_skipped.push(p.key);
    }
  }

  return result;
}
