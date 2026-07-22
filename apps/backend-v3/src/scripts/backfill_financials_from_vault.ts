#!/usr/bin/env tsx
/**
 * One-shot backfill: re-process vault financial documents through all four
 * parsers (KPI, Balance Sheet, Cost Detail, SIE) so that financial_actuals,
 * financial_plan, balance_sheet_actuals, cost_detail_actuals, and
 * indirect_expense_actuals are populated from documents already in the vault.
 *
 * Usage:
 *   npx tsx src/scripts/backfill_financials_from_vault.ts           (dry-run)
 *   npx tsx src/scripts/backfill_financials_from_vault.ts --apply   (commit)
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { llmRouter } from '../lib/llm-router.js';
import {
  ingestFinancialRows,
  ingestBalanceSheetRows,
  ingestSieRows,
} from '../services/financials/ingest.js';

const KNOWN_VAULT_IDS = [73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87];

interface VaultDoc {
  id: number;
  filename: string;
  doc_type: string;
  extracted_text: string | null;
}

interface BackfillResult {
  doc_id: number;
  filename: string;
  status: 'ingested' | 'skipped' | 'error' | 'no_text' | 'unsupported_format';
  plan: number;
  actual: number;
  rejected: number;
  balance_sheet: number;
  cost_detail: number;
  sie: number;
  error?: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  logger.info({ mode: isApply ? 'apply' : 'dry-run' }, 'backfill_financials_from_vault: starting');

  const { rows: docs } = await pool.query<VaultDoc>(
    `SELECT id, filename, doc_type, extracted_text
     FROM vault_documents
     WHERE id = ANY($1) AND deleted_at IS NULL
     ORDER BY id`,
    [KNOWN_VAULT_IDS],
  );

  logger.info({ found: docs.length, requested: KNOWN_VAULT_IDS.length }, 'vault documents found');

  const results: BackfillResult[] = [];

  for (const doc of docs) {
    const result: BackfillResult = {
      doc_id: doc.id,
      filename: doc.filename,
      status: 'skipped',
      plan: 0,
      actual: 0,
      rejected: 0,
      balance_sheet: 0,
      cost_detail: 0,
      sie: 0,
    };

    if (!doc.extracted_text || doc.extracted_text.trim().length === 0) {
      result.status = 'no_text';
      results.push(result);
      logger.warn({ doc_id: doc.id, filename: doc.filename }, 'no extracted text - skipping');
      continue;
    }

    let anyIngested = false;

    try {
      // --- Parser 1: KPI (Income Statement / L1-TARGET / L1-ACTUAL) ---
      const finResult = await llmRouter.route({
        task: 'financial_statement_extract' as const,
        input: { filename: doc.filename, extracted_text: doc.extracted_text },
      });

      if (finResult.ok && finResult.output.is_financial && finResult.output.rows.length > 0) {
        if (isApply) {
          const counts = await ingestFinancialRows(finResult.output.rows, doc.id);
          result.plan = counts.plan;
          result.actual = counts.actual;
          result.rejected = counts.rejected;
        } else {
          for (const row of finResult.output.rows) {
            if (row.kind === 'plan') result.plan++;
            else if (row.kind === 'actual') result.actual++;
          }
        }
        if (result.plan > 0 || result.actual > 0) anyIngested = true;
      }

      // --- Parser 2: Balance Sheet ---
      const looksBalanceSheet = /balance.?sheet/i.test(doc.filename) || /balance.?sheet/i.test(doc.extracted_text.slice(0, 2000));
      if (looksBalanceSheet) {
        const bsResult = await llmRouter.route({
          task: 'balance_sheet_extract' as const,
          input: { filename: doc.filename, extracted_text: doc.extracted_text },
        });

        if (bsResult.ok && bsResult.output.is_balance_sheet && bsResult.output.rows.length > 0) {
          if (isApply) {
            result.balance_sheet = await ingestBalanceSheetRows(bsResult.output.rows, doc.id);
          } else {
            result.balance_sheet = bsResult.output.rows.length;
          }
          if (result.balance_sheet > 0) anyIngested = true;
        }
      }

      // --- Parser 3: Cost Detail (TGT vs ACT) — DISABLED ---
      // TGT vs ACT files are year-to-date cumulative; the deterministic Trended
      // Income Statement (source income_statement) is the single authoritative
      // monthly source for direct costs, so tgt_vs_act no longer writes
      // cost_detail_actuals (see reingest-doc.ts Parser 3).

      // --- Parser 4: SIE (Statement of Indirect Expenses) ---
      const looksSie = /\bsie\b/i.test(doc.filename) || /statement.?of.?indirect/i.test(doc.filename) || /indirect.?expense/i.test(doc.extracted_text.slice(0, 2000));
      if (looksSie) {
        const sieResult = await llmRouter.route({
          task: 'sie_extract' as const,
          input: { filename: doc.filename, extracted_text: doc.extracted_text },
        });

        if (sieResult.ok && sieResult.output.is_sie && sieResult.output.rows.length > 0) {
          if (isApply) {
            result.sie = await ingestSieRows(sieResult.output.rows, doc.id);
          } else {
            result.sie = sieResult.output.rows.length;
          }
          if (result.sie > 0) anyIngested = true;
        }
      }

      result.status = anyIngested ? 'ingested' : 'unsupported_format';
    } catch (err) {
      result.status = 'error';
      result.error = err instanceof Error ? err.message : String(err);
      logger.error({ err, doc_id: doc.id, filename: doc.filename }, 'backfill error');
    }

    results.push(result);
  }

  // Summary
  const summary = {
    mode: isApply ? 'apply' : 'dry-run',
    total_docs: docs.length,
    ingested: results.filter((r) => r.status === 'ingested').length,
    unsupported_format: results.filter((r) => r.status === 'unsupported_format').length,
    no_text: results.filter((r) => r.status === 'no_text').length,
    errors: results.filter((r) => r.status === 'error').length,
    total_plan_rows: results.reduce((s, r) => s + r.plan, 0),
    total_actual_rows: results.reduce((s, r) => s + r.actual, 0),
    total_rejected: results.reduce((s, r) => s + r.rejected, 0),
    total_balance_sheet: results.reduce((s, r) => s + r.balance_sheet, 0),
    total_cost_detail: results.reduce((s, r) => s + r.cost_detail, 0),
    total_sie: results.reduce((s, r) => s + r.sie, 0),
  };

  logger.info({ summary }, 'backfill_financials_from_vault: complete');

  console.log('\n=== Financials Backfill Report ===');
  console.log(`Mode: ${summary.mode}`);
  console.log(`Documents processed: ${summary.total_docs}`);
  console.log(`  Ingested: ${summary.ingested}`);
  console.log(`  Unsupported format: ${summary.unsupported_format}`);
  console.log(`  No text: ${summary.no_text}`);
  console.log(`  Errors: ${summary.errors}`);
  console.log(`KPI rows — Plan: ${summary.total_plan_rows}, Actual: ${summary.total_actual_rows}, Rejected: ${summary.total_rejected}`);
  console.log(`Balance sheet rows: ${summary.total_balance_sheet}`);
  console.log(`Cost detail rows: ${summary.total_cost_detail}`);
  console.log(`SIE rows: ${summary.total_sie}`);
  console.log('\nPer-document breakdown:');
  for (const r of results) {
    const parts = [
      `plan=${r.plan}`,
      `actual=${r.actual}`,
      `bs=${r.balance_sheet}`,
      `cd=${r.cost_detail}`,
      `sie=${r.sie}`,
      `rejected=${r.rejected}`,
    ].join(', ');
    console.log(`  [${r.doc_id}] ${r.filename}: ${r.status} (${parts})${r.error ? ` ERROR: ${r.error}` : ''}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
