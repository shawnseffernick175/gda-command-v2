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
} from './ingest.js';

export interface ReingestResult {
  plan: number;
  actual: number;
  rejected: number;
  balance_sheet: number;
  cost_detail: number;
  sie: number;
  parsers_run: string[];
  any_ingested: boolean;
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
}): Promise<ReingestResult> {
  const { docId, filename, extractedText, docType } = params;

  const result: ReingestResult = {
    plan: 0,
    actual: 0,
    rejected: 0,
    balance_sheet: 0,
    cost_detail: 0,
    sie: 0,
    parsers_run: [],
    any_ingested: false,
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
  if (looksFinancial) {
    try {
      const finResult = await llmRouter.route({
        task: 'financial_statement_extract' as const,
        input: { filename, extracted_text: extractedText },
      });
      result.parsers_run.push('financial_statement_extract');
      if (finResult.ok && finResult.output.is_financial && finResult.output.rows.length > 0) {
        const counts = await ingestFinancialRows(finResult.output.rows);
        result.plan = counts.plan;
        result.actual = counts.actual;
        result.rejected = counts.rejected;
        if (counts.plan > 0 || counts.actual > 0) result.any_ingested = true;
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: KPI parser failed');
    }
  }

  // --- Parser 2: Balance Sheet ---
  const looksBalanceSheet = /balance.?sheet/i.test(filename) || /balance.?sheet/i.test(head);
  if (looksBalanceSheet) {
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

  // --- Parser 3: Cost Detail (TGT vs ACT) ---
  const looksCostDetail = /tgt.?vs.?act/i.test(filename) || /target.?vs.?actual/i.test(filename);
  if (looksCostDetail) {
    try {
      const cdResult = await llmRouter.route({
        task: 'cost_detail_extract' as const,
        input: { filename, extracted_text: extractedText },
      });
      result.parsers_run.push('cost_detail_extract');
      if (cdResult.ok && cdResult.output.is_cost_detail && cdResult.output.rows.length > 0) {
        result.cost_detail = await ingestCostDetailRows(cdResult.output.rows, docId);
        if (result.cost_detail > 0) result.any_ingested = true;
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: cost detail parser failed');
    }
  }

  // --- Parser 4: SIE (Statement of Indirect Expenses) ---
  const looksSie =
    /\bsie\b/i.test(filename) ||
    /statement.?of.?indirect/i.test(filename) ||
    /indirect.?expense/i.test(head);
  if (looksSie) {
    try {
      const sieResult = await llmRouter.route({
        task: 'sie_extract' as const,
        input: { filename, extracted_text: extractedText },
      });
      result.parsers_run.push('sie_extract');
      if (sieResult.ok && sieResult.output.is_sie && sieResult.output.rows.length > 0) {
        result.sie = await ingestSieRows(sieResult.output.rows, docId);
        if (result.sie > 0) result.any_ingested = true;
      }
    } catch (err) {
      logger.warn({ err, docId, filename }, 'reingest: SIE parser failed');
    }
  }

  return result;
}
