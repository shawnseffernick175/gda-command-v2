/**
 * Financials ingest service.
 *
 * Upserts extracted financial rows into financial_plan / financial_actuals,
 * keyed on (period, fiscal_year, quarter) so distinct periods (e.g. FY26 Mar vs
 * FY26 Q1) coexist instead of clobbering each other. Only non-null values are written, and
 * existing columns are preserved via COALESCE so a partial upload does not
 * zero out previously ingested figures.
 *
 * Owner choice: real uploaded data replaces the seed/demo rows. We clear rows
 * flagged is_seed=true (see migration v3_068_financials_seed_flag.sql) ONLY
 * after the first real row is successfully upserted. An empty or all-failed
 * extract (rows=[]) leaves existing data intact so a non-KPI upload (balance
 * sheet, GL detail) never blanks the Financials tab.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { FinancialStatementExtractOutput } from '../../lib/llm-router.types.js';

type FinancialRow = FinancialStatementExtractOutput['rows'][number];

const METRIC_MIN = -100;
const METRIC_MAX = 100;

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Deterministic self-validation guard (layer 2). The model EXTRACTS; this pure
 * function RECOMPUTES derived metrics from the raw F/S Group subtotals and
 * overrides the model when components are available. Implausible values that
 * cannot be recomputed are nulled (never stored). Returns a new row; never
 * fabricates a value from nothing.
 */
export function validateAndRecompute(row: FinancialRow): FinancialRow {
  const out: FinancialRow = { ...row };
  const docContext = { period: row.period, fiscal_year: row.fiscal_year, quarter: row.quarter, kind: row.kind };

  const totalRevenue = isFiniteNumber(out.total_revenue) ? out.total_revenue : null;
  const totalDirectCosts = isFiniteNumber(out.total_direct_costs) ? out.total_direct_costs : null;
  const costOfOps = isFiniteNumber(out.cost_of_operations) ? out.cost_of_operations : null;

  let gmDollars: number | null = null;

  // (a) Recompute gross_margin from components and OVERRIDE the model value.
  if (totalRevenue !== null && totalDirectCosts !== null && totalRevenue !== 0) {
    gmDollars = totalRevenue - totalDirectCosts;
    const recomputedGm = round3((gmDollars / totalRevenue) * 100);

    // (d) Cross-check: if the model offered a gross_margin that disagrees with
    // the recomputed one by more than 1.0 absolute points, that is the
    // "AI hallucination caught" signal. We always trust the recomputed value.
    if (isFiniteNumber(out.gross_margin) && Math.abs(out.gross_margin - recomputedGm) > 1.0) {
      logger.warn(
        { ...docContext, ai_gross_margin: out.gross_margin, recomputed_gross_margin: recomputedGm },
        'AI gross_margin disagrees with recomputed value; trusting recomputed',
      );
    }
    out.gross_margin = recomputedGm;

    // EBIT = GM$ - Cost of Operations. Override when model EBIT is null or off
    // by more than 1% of revenue.
    if (costOfOps !== null) {
      const recomputedEbit = round3(gmDollars - costOfOps);
      const tolerance = Math.abs(totalRevenue) * 0.01;
      if (!isFiniteNumber(out.ebit) || Math.abs(out.ebit - recomputedEbit) > tolerance) {
        out.ebit = recomputedEbit;
      }
    }
  }

  // (b) Recompute ros from sales (or total_revenue) and ebit when ros is null
  // or implausible (out of [-100, 100]).
  const salesBasis = isFiniteNumber(out.sales) ? out.sales : totalRevenue;
  const rosImplausible = isFiniteNumber(out.ros) && (out.ros < METRIC_MIN || out.ros > METRIC_MAX);
  if (
    salesBasis !== null &&
    salesBasis !== 0 &&
    isFiniteNumber(out.ebit) &&
    (!isFiniteNumber(out.ros) || rosImplausible)
  ) {
    out.ros = round3((out.ebit / salesBasis) * 100);
  }

  // (c) Sanity clamp: gross_margin and ros must be within [-100, 100]. If still
  // out of range here it could not be recomputed from components -> null + warn.
  if (isFiniteNumber(out.gross_margin) && (out.gross_margin < METRIC_MIN || out.gross_margin > METRIC_MAX)) {
    logger.warn({ ...docContext, field: 'gross_margin', value: out.gross_margin }, 'implausible financial metric nulled');
    out.gross_margin = null;
  }
  if (isFiniteNumber(out.ros) && (out.ros < METRIC_MIN || out.ros > METRIC_MAX)) {
    logger.warn({ ...docContext, field: 'ros', value: out.ros }, 'implausible financial metric nulled');
    out.ros = null;
  }

  return out;
}

/**
 * Deterministic storability guard (layer 3). Rejects rows that carry no usable
 * KPI signal so hallucinated / implausible artifacts never reach the tables.
 * Returns a reason string when the row must be rejected, or null when it is safe
 * to store.
 *
 * Takes BOTH the raw extracted row and the recomputed row. The TGT-vs-ACT failure
 * signature is a cost/rate build-up file with no real revenue line: the model
 * copies the total direct-cost subtotal into BOTH sales and total_direct_costs,
 * so revenue == cost. validateAndRecompute then derives gross_margin=0 and a
 * spurious negative EBIT (= -cost_of_operations), which is NOT a real profit
 * signal. We detect the artifact on the RAW row (revenue == cost, no model EBIT,
 * no model gross_margin) so the recompute's fabricated EBIT cannot mask it.
 */
export function rejectReason(raw: FinancialRow, row: FinancialRow): string | null {
  const sales = isFiniteNumber(row.sales) ? row.sales : null;
  const totalRevenue = isFiniteNumber(row.total_revenue) ? row.total_revenue : null;
  const ebit = isFiniteNumber(row.ebit) ? row.ebit : null;
  const gm = isFiniteNumber(row.gross_margin) ? row.gross_margin : null;
  const ros = isFiniteNumber(row.ros) ? row.ros : null;
  const revenueBasis = sales !== null ? sales : totalRevenue;

  // (1) Nothing to store: no revenue/sales AND no EBIT AND no gross margin.
  if ((revenueBasis === null || revenueBasis === 0) && ebit === null && gm === null) {
    return 'no usable signal (no revenue/sales, no ebit, no gross_margin)';
  }

  // (2) revenue == cost, no profit, no margin -- the TGT-vs-ACT artifact.
  // Evaluated on the RAW model output: total_revenue and total_direct_costs
  // present and equal (within 0.5%), with no genuine model EBIT and no genuine
  // model gross_margin. This is a cost build-up where revenue was fabricated
  // from a cost subtotal; the recompute's derived EBIT/GM are not real signal.
  const rawRevenue = isFiniteNumber(raw.total_revenue) ? raw.total_revenue : null;
  const rawDirectCosts = isFiniteNumber(raw.total_direct_costs) ? raw.total_direct_costs : null;
  const rawEbit = isFiniteNumber(raw.ebit) ? raw.ebit : null;
  const rawGm = isFiniteNumber(raw.gross_margin) ? raw.gross_margin : null;
  if (rawRevenue !== null && rawDirectCosts !== null && rawRevenue !== 0) {
    const relDiff = Math.abs(rawRevenue - rawDirectCosts) / Math.abs(rawRevenue);
    if (relDiff <= 0.005 && rawEbit === null && (rawGm === null || rawGm === 0)) {
      return 'revenue == direct costs with no ebit and no gross margin (cost build-up artifact)';
    }
  }

  // (3) No usable KPI at all after recompute: gross_margin AND ebit AND ros null.
  if (gm === null && ebit === null && ros === null) {
    return 'no usable KPI signal (gross_margin, ebit, ros all null)';
  }

  return null;
}

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
    ON CONFLICT (period, fiscal_year, quarter)
    DO UPDATE SET ${updates.join(', ')}`;

  await pool.query(sql, params);
  return true;
}

export async function ingestFinancialRows(
  rows: FinancialStatementExtractOutput['rows'],
): Promise<{ plan: number; actual: number; rejected: number }> {
  let plan = 0;
  let actual = 0;
  let rejected = 0;

  // Clear seed/demo rows ONLY after a real row is successfully upserted. An empty
  // extract (rows=[]) or an all-failed extract must leave existing data intact,
  // otherwise a balance sheet / GL upload with no KPI mapping would blank the tab.
  let seedCleared = false;
  async function clearSeedOnce(): Promise<void> {
    if (seedCleared) return;
    await pool.query(`DELETE FROM financial_plan WHERE is_seed = true`);
    await pool.query(`DELETE FROM financial_actuals WHERE is_seed = true`);
    seedCleared = true;
  }

  if (rows.length > 0) {
    for (const rawRow of rows) {
      if (rawRow.quarter === null || rawRow.quarter === undefined) continue;

      // Layer 2: deterministically verify/recompute the model's numbers before
      // they are stored. Never persist hallucinated or out-of-range metrics.
      const row = validateAndRecompute(rawRow);

      // Layer 3: storability guard. Reject (skip, do not store) rows with no
      // usable signal -- e.g. the TGT-vs-ACT cost build-up artifact where the
      // model copied a cost subtotal into sales. Continue ingest; never throw.
      const reason = rejectReason(rawRow, row);
      if (reason !== null) {
        rejected += 1;
        logger.warn(
          { period: row.period, fiscal_year: row.fiscal_year, quarter: row.quarter, kind: row.kind, reason },
          'implausible financial row rejected (not stored)',
        );
        continue;
      }

      try {
        if (row.kind === 'plan') {
          await upsertRow('financial_plan', PLAN_COLUMNS, row);
          plan += 1;
        } else if (row.kind === 'actual') {
          await upsertRow('financial_actuals', ACTUAL_COLUMNS, row);
          actual += 1;
        } else {
          continue;
        }
        await clearSeedOnce();
      } catch (err) {
        logger.warn({ err, period: row.period, kind: row.kind }, 'Financial row upsert failed');
      }
    }
  }

  return { plan, actual, rejected };
}
