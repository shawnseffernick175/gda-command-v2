/**
 * Financials ingest service.
 *
 * Upserts extracted financial rows into financial_plan / financial_actuals,
 * keyed on (fiscal_year, quarter). Only non-null values are written, and
 * existing columns are preserved via COALESCE so a partial upload does not
 * zero out previously ingested figures.
 *
 * Owner choice: real uploaded data replaces the seed/demo rows. Before the
 * first real upsert we clear rows flagged is_seed=true (see migration
 * v3_068_financials_seed_flag.sql). After the seed rows are gone this delete
 * is a no-op, so it is safe to run on every ingest.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { FinancialStatementExtractOutput } from '../../lib/llm-router.types.js';

type FinancialRow = FinancialStatementExtractOutput['rows'][number];

const PLAN_COLUMNS: Record<string, keyof FinancialRow> = {
  plan_orders: 'orders',
  plan_sales: 'sales',
  plan_ebit: 'ebit',
  plan_gross_margin: 'gross_margin',
  plan_ros: 'ros',
};

const ACTUAL_COLUMNS: Record<string, keyof FinancialRow> = {
  actual_orders: 'orders',
  actual_sales: 'sales',
  actual_ebit: 'ebit',
  actual_gross_margin: 'gross_margin',
  actual_ros: 'ros',
};

async function upsertRow(
  table: 'financial_plan' | 'financial_actuals',
  columnMap: Record<string, keyof FinancialRow>,
  row: FinancialRow,
): Promise<boolean> {
  const cols: string[] = ['period', 'fiscal_year', 'quarter'];
  const params: unknown[] = [row.period, row.fiscal_year, row.quarter];

  for (const [dbCol, srcKey] of Object.entries(columnMap)) {
    const value = row[srcKey];
    if (value !== null && value !== undefined) {
      cols.push(dbCol);
      params.push(value);
    }
  }

  const placeholders = cols.map((_c, i) => `$${i + 1}`);
  const valueCols = cols.filter((c) => c !== 'period' && c !== 'fiscal_year' && c !== 'quarter');
  const updates = ['period = EXCLUDED.period'];
  for (const c of valueCols) {
    updates.push(`${c} = COALESCE(EXCLUDED.${c}, ${table}.${c})`);
  }

  const sql = `INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (fiscal_year, quarter)
    DO UPDATE SET ${updates.join(', ')}`;

  await pool.query(sql, params);
  return true;
}

export async function ingestFinancialRows(
  rows: FinancialStatementExtractOutput['rows'],
): Promise<{ plan: number; actual: number }> {
  let plan = 0;
  let actual = 0;

  // Replace seed/demo data on the first real ingest. No-op once seed rows gone.
  await pool.query(`DELETE FROM financial_plan WHERE is_seed = true`);
  await pool.query(`DELETE FROM financial_actuals WHERE is_seed = true`);

  for (const row of rows) {
    if (row.quarter === null || row.quarter === undefined) continue;

    try {
      if (row.kind === 'plan') {
        await upsertRow('financial_plan', PLAN_COLUMNS, row);
        plan += 1;
      } else if (row.kind === 'actual') {
        await upsertRow('financial_actuals', ACTUAL_COLUMNS, row);
        actual += 1;
      }
    } catch (err) {
      logger.warn({ err, period: row.period, kind: row.kind }, 'Financial row upsert failed');
    }
  }

  return { plan, actual };
}
