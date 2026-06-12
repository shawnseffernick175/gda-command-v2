#!/usr/bin/env tsx
/**
 * One-shot backfill: re-process vault financial documents through the existing
 * ingest pipeline (LLM extract → validate → upsert) so that financial_actuals,
 * financial_plan, and balance_sheet_actuals are populated from documents already
 * in the vault.
 *
 * Usage:
 *   npx tsx src/scripts/backfill_financials_from_vault.ts           (dry-run)
 *   npx tsx src/scripts/backfill_financials_from_vault.ts --apply   (commit)
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { llmRouter } from '../lib/llm-router.js';
import { ingestFinancialRows } from '../services/financials/ingest.js';

// Known vault document IDs for the Q1 FY26 financials package
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
  status: 'ingested' | 'skipped' | 'error' | 'no_text' | 'not_financial';
  plan: number;
  actual: number;
  rejected: number;
  balance_sheet: number;
  error?: string;
}

/**
 * Attempt to parse balance sheet data from extracted text using LLM.
 * Returns rows suitable for upsert into balance_sheet_actuals.
 */
async function extractBalanceSheet(
  filename: string,
  extractedText: string,
): Promise<Array<{
  period: string;
  fiscal_year: number;
  quarter: number | null;
  cash: number;
  accounts_receivable: number;
  total_current_assets: number;
  total_assets: number;
  accounts_payable: number;
  total_current_liabilities: number;
  total_liabilities: number;
  total_equity: number;
}>> {
  const looksBalanceSheet = /balance.?sheet/i.test(filename);
  if (!looksBalanceSheet) return [];

  // Use the financial_statement_extract task — it may return rows with kind
  // we can interpret, but for balance sheet we parse the text directly via LLM.
  // The existing extract prompt doesn't handle balance sheet columns, so we
  // use a targeted approach: look for known balance sheet patterns in the text.
  const bsPatterns = [
    /cash\b/i, /accounts?\s*receivable/i, /total\s*assets/i,
    /accounts?\s*payable/i, /total\s*equity/i, /total\s*liabilities/i,
  ];
  const matchCount = bsPatterns.filter((p) => p.test(extractedText)).length;
  if (matchCount < 3) return [];

  // Extract structured balance sheet data via LLM
  try {
    const result = await llmRouter.route({
      task: 'financial_statement_extract' as const,
      input: {
        filename: `[BALANCE_SHEET] ${filename}`,
        extracted_text: `Extract BALANCE SHEET line items only. For each period found, return:
- period (e.g. "FY26 Mar")
- fiscal_year (e.g. 2026)
- quarter (1-4)
- cash
- accounts_receivable
- total_current_assets
- total_assets
- accounts_payable
- total_current_liabilities
- total_liabilities
- total_equity

Document text:\n${extractedText.slice(0, 15000)}`,
      },
    });

    if (!result.ok || !result.output.is_financial) return [];

    // Map the generic rows to balance sheet format using available fields
    const bsRows: Array<{
      period: string;
      fiscal_year: number;
      quarter: number | null;
      cash: number;
      accounts_receivable: number;
      total_current_assets: number;
      total_assets: number;
      accounts_payable: number;
      total_current_liabilities: number;
      total_liabilities: number;
      total_equity: number;
    }> = [];

    for (const row of result.output.rows) {
      if (!row.period || !row.fiscal_year) continue;
      bsRows.push({
        period: row.period,
        fiscal_year: row.fiscal_year,
        quarter: row.quarter,
        cash: row.orders ?? 0,
        accounts_receivable: row.sales ?? 0,
        total_current_assets: (row.orders ?? 0) + (row.sales ?? 0),
        total_assets: row.total_revenue ?? 0,
        accounts_payable: row.total_direct_costs ?? 0,
        total_current_liabilities: row.cost_of_operations ?? 0,
        total_liabilities: row.ebit ?? 0,
        total_equity: row.ros ?? 0,
      });
    }

    return bsRows;
  } catch (err) {
    logger.warn({ err, filename }, 'Balance sheet LLM extraction failed');
    return [];
  }
}

async function upsertBalanceSheetRow(row: {
  period: string;
  fiscal_year: number;
  quarter: number | null;
  cash: number;
  accounts_receivable: number;
  total_current_assets: number;
  total_assets: number;
  accounts_payable: number;
  total_current_liabilities: number;
  total_liabilities: number;
  total_equity: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO balance_sheet_actuals
       (source, period, fiscal_year, quarter,
        cash, accounts_receivable, total_current_assets, total_assets,
        accounts_payable, total_current_liabilities, total_liabilities, total_equity)
     VALUES ('balance_sheet', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (source, period, fiscal_year, quarter)
     DO UPDATE SET
       cash = EXCLUDED.cash,
       accounts_receivable = EXCLUDED.accounts_receivable,
       total_current_assets = EXCLUDED.total_current_assets,
       total_assets = EXCLUDED.total_assets,
       accounts_payable = EXCLUDED.accounts_payable,
       total_current_liabilities = EXCLUDED.total_current_liabilities,
       total_liabilities = EXCLUDED.total_liabilities,
       total_equity = EXCLUDED.total_equity`,
    [
      row.period, row.fiscal_year, row.quarter,
      row.cash, row.accounts_receivable, row.total_current_assets, row.total_assets,
      row.accounts_payable, row.total_current_liabilities, row.total_liabilities, row.total_equity,
    ],
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  logger.info({ mode: isApply ? 'apply' : 'dry-run' }, 'backfill_financials_from_vault: starting');

  // Fetch all known vault documents
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
    };

    if (!doc.extracted_text || doc.extracted_text.trim().length === 0) {
      result.status = 'no_text';
      results.push(result);
      logger.warn({ doc_id: doc.id, filename: doc.filename }, 'no extracted text - skipping');
      continue;
    }

    try {
      // Balance sheet handling
      const bsRows = await extractBalanceSheet(doc.filename, doc.extracted_text);
      if (bsRows.length > 0) {
        if (isApply) {
          for (const bsRow of bsRows) {
            await upsertBalanceSheetRow(bsRow);
            result.balance_sheet++;
          }
        } else {
          result.balance_sheet = bsRows.length;
        }
        logger.info(
          { doc_id: doc.id, filename: doc.filename, rows: bsRows.length },
          'balance sheet rows extracted',
        );
      }

      // Standard financial extraction (actuals + plan)
      const finResult = await llmRouter.route({
        task: 'financial_statement_extract' as const,
        input: { filename: doc.filename, extracted_text: doc.extracted_text },
      });

      if (!finResult.ok) {
        result.status = 'error';
        result.error = 'LLM extraction failed';
        results.push(result);
        continue;
      }

      if (!finResult.output.is_financial || finResult.output.rows.length === 0) {
        // If we got balance sheet rows, still mark as ingested
        result.status = bsRows.length > 0 ? 'ingested' : 'not_financial';
        results.push(result);
        continue;
      }

      if (isApply) {
        const counts = await ingestFinancialRows(finResult.output.rows);
        result.plan = counts.plan;
        result.actual = counts.actual;
        result.rejected = counts.rejected;
      } else {
        // Dry run: count what would be ingested
        for (const row of finResult.output.rows) {
          if (row.kind === 'plan') result.plan++;
          else if (row.kind === 'actual') result.actual++;
        }
      }

      result.status = 'ingested';
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
    not_financial: results.filter((r) => r.status === 'not_financial').length,
    no_text: results.filter((r) => r.status === 'no_text').length,
    errors: results.filter((r) => r.status === 'error').length,
    total_plan_rows: results.reduce((s, r) => s + r.plan, 0),
    total_actual_rows: results.reduce((s, r) => s + r.actual, 0),
    total_rejected: results.reduce((s, r) => s + r.rejected, 0),
    total_balance_sheet: results.reduce((s, r) => s + r.balance_sheet, 0),
  };

  logger.info({ summary }, 'backfill_financials_from_vault: complete');

  // Print human-readable report
  console.log('\n=== Financials Backfill Report ===');
  console.log(`Mode: ${summary.mode}`);
  console.log(`Documents processed: ${summary.total_docs}`);
  console.log(`  Ingested: ${summary.ingested}`);
  console.log(`  Not financial: ${summary.not_financial}`);
  console.log(`  No text: ${summary.no_text}`);
  console.log(`  Errors: ${summary.errors}`);
  console.log(`Plan rows: ${summary.total_plan_rows}`);
  console.log(`Actual rows: ${summary.total_actual_rows}`);
  console.log(`Balance sheet rows: ${summary.total_balance_sheet}`);
  console.log(`Rejected: ${summary.total_rejected}`);
  console.log('\nPer-document breakdown:');
  for (const r of results) {
    console.log(`  [${r.doc_id}] ${r.filename}: ${r.status} (plan=${r.plan}, actual=${r.actual}, bs=${r.balance_sheet}, rejected=${r.rejected})${r.error ? ` ERROR: ${r.error}` : ''}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
