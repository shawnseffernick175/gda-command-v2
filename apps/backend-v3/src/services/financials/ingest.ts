/**
 * Financials ingest service.
 *
 * Upserts extracted financial rows into financial_plan / financial_actuals,
 * keyed on (source, period, fiscal_year, quarter) so distinct source-series
 * (official income_statement P&L vs l1_actual project ledger vs l1_target plan)
 * AND distinct periods (e.g. FY26 Mar vs the FY26 Q1 quarter total) all coexist
 * instead of clobbering each other. Only non-null values are written, and
 * existing columns are preserved via COALESCE so a partial upload does not
 * zero out previously ingested figures.
 *
 * `source` is orthogonal to kind: income_statement and l1_actual are both
 * kind=actual but two distinct rows for the same month. See migration
 * v3_071_financials_source_dimension.sql.
 *
 * QUARTER TOTAL (deterministic recompute, not a DB view): after the month rows
 * are upserted, recomputeQuarterTotals() derives one quarter-total row per
 * (source, fiscal_year, quarter) by SUMMING that source's month rows in DOLLARS
 * and recomputing GM%/ROS% from the summed dollars -- never by averaging the
 * AI's per-month percentages. A recompute (vs a view) is used because the
 * read routes and the KPI-header join query the tables directly and need the
 * quarter row materialized with the same columns as month rows. The quarter row
 * has period "FY26 Q1" (LIKE '%Q%') and month rows do not, so the sum that
 * builds it excludes prior quarter rows and never double-counts.
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

const VALID_SOURCES = new Set(['income_statement', 'l1_actual', 'l1_target']);

/**
 * Resolve the source-series discriminator for a row. Prefer the model's value
 * when it is one of the known sources; otherwise fall back to a sensible default
 * derived from kind so older mocks / partial extracts still store a coherent
 * series (plan -> l1_target, actual -> income_statement). source is orthogonal
 * to kind, so this default is only a fallback.
 */
function resolveSource(row: FinancialRow): string {
  const s = row.source;
  if (typeof s === 'string' && VALID_SOURCES.has(s)) return s;
  return row.kind === 'plan' ? 'l1_target' : 'income_statement';
}

async function upsertRow(
  table: 'financial_plan' | 'financial_actuals',
  columnMap: Record<string, keyof FinancialRow>,
  row: FinancialRow,
): Promise<boolean> {
  const cols: string[] = ['source', 'period', 'fiscal_year', 'quarter'];
  const params: unknown[] = [resolveSource(row), row.period, row.fiscal_year, row.quarter];

  for (const [dbCol, srcKey] of Object.entries(columnMap)) {
    const value = row[srcKey];
    if (value !== null && value !== undefined) {
      cols.push(dbCol);
      params.push(value);
    }
  }

  const keyCols = new Set(['source', 'period', 'fiscal_year', 'quarter']);
  const placeholders = cols.map((_c, i) => `$${i + 1}`);
  const valueCols = cols.filter((c) => !keyCols.has(c));
  const updates = ['period = EXCLUDED.period'];
  for (const c of valueCols) {
    updates.push(`${c} = COALESCE(EXCLUDED.${c}, ${table}.${c})`);
  }

  const sql = `INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (source, period, fiscal_year, quarter)
    DO UPDATE SET ${updates.join(', ')}`;

  await pool.query(sql, params);
  return true;
}

/**
 * Deterministic quarter-total recompute (layer 4). For every (source,
 * fiscal_year, quarter) that has month rows, sum the month rows' DOLLAR figures
 * (orders, sales, ebit) and recompute GM%/ROS% from the summed dollars, then
 * upsert a single quarter-total row with period "FY<yy> Q<quarter>". Month rows
 * are those whose period does NOT contain 'Q' (e.g. "FY26 Mar"); the quarter row
 * itself contains 'Q' and is excluded from the sum, so re-running is idempotent
 * and never double-counts.
 *
 * GM%/ROS% come from SUMMED dollars, never from averaging the per-month
 * percentages. GM$ for the quarter is sum(sales) - sum(direct costs); since the
 * stored month rows do not retain a direct-cost column, we reconstruct quarter
 * GM$ from each month's own (sales, gross_margin) -> month GM$ = sales*gm/100,
 * sum those, then quarter GM% = sum(GM$)/sum(sales)*100. ROS% = sum(ebit)/
 * sum(sales)*100. Orders are summed only when present on every month (else null).
 */
async function recomputeQuarterTotals(
  table: 'financial_plan' | 'financial_actuals',
  prefix: 'plan' | 'actual',
): Promise<void> {
  const groups = await pool.query<{ source: string; fiscal_year: number; quarter: number }>(
    `SELECT DISTINCT source, fiscal_year, quarter
       FROM ${table}
      WHERE quarter IS NOT NULL
        AND period NOT LIKE '%Q%'`,
  );

  for (const g of groups.rows) {
    const months = await pool.query<{
      orders: string | null;
      sales: string | null;
      ebit: string | null;
      gross_margin: string | null;
    }>(
      `SELECT ${prefix}_orders AS orders, ${prefix}_sales AS sales,
              ${prefix}_ebit AS ebit, ${prefix}_gross_margin AS gross_margin
         FROM ${table}
        WHERE source = $1 AND fiscal_year = $2 AND quarter = $3
          AND period NOT LIKE '%Q%'`,
      [g.source, g.fiscal_year, g.quarter],
    );
    if (months.rows.length === 0) continue;

    let sumSales = 0;
    let sumEbit = 0;
    let sumGmDollars = 0;
    let sumOrders = 0;
    let allOrdersPresent = true;
    for (const m of months.rows) {
      const sales = m.sales === null ? null : Number(m.sales);
      const ebit = m.ebit === null ? null : Number(m.ebit);
      const gm = m.gross_margin === null ? null : Number(m.gross_margin);
      const orders = m.orders === null ? null : Number(m.orders);
      if (isFiniteNumber(sales)) {
        sumSales += sales;
        if (isFiniteNumber(gm)) sumGmDollars += (sales * gm) / 100;
      }
      if (isFiniteNumber(ebit)) sumEbit += ebit;
      if (isFiniteNumber(orders)) sumOrders += orders;
      else allOrdersPresent = false;
    }

    const quarterGm = sumSales !== 0 ? round3((sumGmDollars / sumSales) * 100) : null;
    const quarterRos = sumSales !== 0 ? round3((sumEbit / sumSales) * 100) : null;
    const quarterPeriod = `FY${String(g.fiscal_year).slice(-2)} Q${g.quarter}`;

    const cols = [`source`, `period`, `fiscal_year`, `quarter`, `${prefix}_sales`, `${prefix}_ebit`];
    const params: unknown[] = [g.source, quarterPeriod, g.fiscal_year, g.quarter, sumSales, sumEbit];
    if (allOrdersPresent) {
      cols.push(`${prefix}_orders`);
      params.push(sumOrders);
    }
    if (quarterGm !== null) {
      cols.push(`${prefix}_gross_margin`);
      params.push(quarterGm);
    }
    if (quarterRos !== null) {
      cols.push(`${prefix}_ros`);
      params.push(quarterRos);
    }

    const keyCols = new Set(['source', 'period', 'fiscal_year', 'quarter']);
    const placeholders = cols.map((_c, i) => `$${i + 1}`);
    const updates = ['period = EXCLUDED.period'];
    for (const c of cols.filter((c) => !keyCols.has(c))) {
      updates.push(`${c} = EXCLUDED.${c}`);
    }
    await pool.query(
      `INSERT INTO ${table} (${cols.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (source, period, fiscal_year, quarter)
        DO UPDATE SET ${updates.join(', ')}`,
      params,
    );
  }
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

  // Layer 4: rebuild quarter-total rows from the freshly upserted month rows.
  // Idempotent; recomputes GM%/ROS% from summed dollars per source.
  try {
    if (plan > 0) await recomputeQuarterTotals('financial_plan', 'plan');
    if (actual > 0) await recomputeQuarterTotals('financial_actuals', 'actual');
  } catch (err) {
    logger.warn({ err }, 'Quarter-total recompute failed');
  }

  return { plan, actual, rejected };
}
