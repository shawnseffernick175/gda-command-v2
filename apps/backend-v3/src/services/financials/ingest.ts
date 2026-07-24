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
import { aggregateDirectCostRows } from './deterministic-parsers.js';
import type { FinancialStatementExtractOutput, BalanceSheetExtractOutput, CostDetailExtractOutput, SieExtractOutput, ApExtractOutput, ArExtractOutput, TrialBalanceExtractOutput, ProjectRevenueExtractOutput, ProjectCostPoolExtractOutput, ServiceCenterExtractOutput, PoolRateExtractOutput } from '../../lib/llm-router.types.js';

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

  // (1) Nothing to store: no revenue/sales, no EBIT, and no gross margin. A zero
  // in these fields is as empty as null. `orders` is intentionally NOT treated as
  // a P&L signal: an "orders-only" row (e.g. an annual/backlog orders figure that
  // an extract attributed to a month with no ingested actuals) must never create a
  // phantom monthly income-statement row. This keeps backlog/orders out of the
  // monthly P&L orders series and is the root-cause guard for the phantom-June row.
  const hasRevenue = revenueBasis !== null && revenueBasis !== 0;
  const hasEbit = ebit !== null && ebit !== 0;
  const hasGm = gm !== null && gm !== 0;
  if (!hasRevenue && !hasEbit && !hasGm) {
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
  sourceDocId?: number | null,
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

  // Only financial_actuals carries source_doc_id (the vault doc that produced
  // this actual row). Plan rows have no single source document.
  if (table === 'financial_actuals' && sourceDocId !== null && sourceDocId !== undefined) {
    cols.push('source_doc_id');
    params.push(sourceDocId);
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
  sourceDocId?: number | null,
): Promise<{ plan: number; actual: number; rejected: number; parse_warnings: string[] }> {
  let plan = 0;
  let actual = 0;
  let rejected = 0;
  const parse_warnings: string[] = [];

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
        // BUG 5: route by source-series, not by kind alone. Company-P&L rows
        // carry an explicit source (l1_actual / l1_target). TARGET rows arrive
        // as kind 'plan' but MUST land in financial_actuals so the trend/variance
        // path can read target (l1_target) against actual (l1_actual) on the same
        // natural key. Only generic budget/plan rows (no company-P&L source) go
        // to financial_plan.
        const companyPnlSource =
          row.source === 'l1_actual' || row.source === 'l1_target';
        if (companyPnlSource) {
          await upsertRow('financial_actuals', ACTUAL_COLUMNS, row, sourceDocId);
          actual += 1;
        } else if (row.kind === 'plan') {
          await upsertRow('financial_plan', PLAN_COLUMNS, row);
          plan += 1;
        } else if (row.kind === 'actual') {
          await upsertRow('financial_actuals', ACTUAL_COLUMNS, row, sourceDocId);
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

  // Layer 5: zero-actuals guard. If actuals were ingested but every actual row
  // had sales=0 AND ebit=0 while the raw extract contained non-zero numeric
  // content, flag it as a parse warning so ingestion-status can surface it
  // instead of silently writing zeros.
  if (actual > 0) {
    const allZeroActuals = rows
      .filter((r) => r.kind === 'actual')
      .every((r) => {
        const s = isFiniteNumber(r.sales) ? r.sales : 0;
        const e = isFiniteNumber(r.ebit) ? r.ebit : 0;
        const tr = isFiniteNumber(r.total_revenue) ? r.total_revenue : 0;
        return s === 0 && e === 0 && tr === 0;
      });
    if (allZeroActuals) {
      const warning = `doc_id=${sourceDocId ?? 'unknown'}: ingested ${actual} actual row(s) with all-zero sales/ebit/total_revenue — possible column-mapping failure`;
      parse_warnings.push(warning);
      logger.warn(
        { sourceDocId, actual_count: actual },
        'zero-actuals guard: all ingested actual rows have zero sales/ebit/revenue',
      );
    }
  }

  return { plan, actual, rejected, parse_warnings };
}

// ---------------------------------------------------------------------------
// Balance Sheet ingest
// ---------------------------------------------------------------------------

type BalanceSheetRow = BalanceSheetExtractOutput['rows'][number];

export async function ingestBalanceSheetRows(
  rows: BalanceSheetRow[],
  sourceDocId?: number | null,
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row.period || !row.fiscal_year) continue;
    try {
      const params = [
        row.period, row.fiscal_year, row.quarter,
        row.cash, row.accounts_receivable, row.total_current_assets, row.total_assets,
        row.accounts_payable, row.total_current_liabilities, row.total_liabilities, row.total_equity,
        sourceDocId ?? null,
      ];
      await pool.query(
        `INSERT INTO balance_sheet_actuals
           (source, period, fiscal_year, quarter,
            cash, accounts_receivable, total_current_assets, total_assets,
            accounts_payable, total_current_liabilities, total_liabilities, total_equity,
            source_doc_id)
         VALUES ('balance_sheet', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (source, period, fiscal_year, quarter)
         DO UPDATE SET
           cash = EXCLUDED.cash,
           accounts_receivable = EXCLUDED.accounts_receivable,
           total_current_assets = EXCLUDED.total_current_assets,
           total_assets = EXCLUDED.total_assets,
           accounts_payable = EXCLUDED.accounts_payable,
           total_current_liabilities = EXCLUDED.total_current_liabilities,
           total_liabilities = EXCLUDED.total_liabilities,
           total_equity = EXCLUDED.total_equity,
           source_doc_id = EXCLUDED.source_doc_id`,
        params,
      );
      count++;
    } catch (err) {
      logger.warn({ err, period: row.period }, 'Balance sheet row upsert failed');
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Cost Detail (TGT vs ACT) ingest
// ---------------------------------------------------------------------------

type CostDetailRow = CostDetailExtractOutput['rows'][number];

export async function ingestCostDetailRows(
  rows: CostDetailRow[],
  sourceDocId?: number | null,
  source = 'tgt_vs_act',
): Promise<number> {
  // Cost-of-revenue is DIRECT-pool only, and every element is collapsed to one of
  // the eight canonical statement lines. This is the single source of truth: any
  // source doc that mentions a direct-cost figure lands on the SAME (period,
  // canonical line, DIRECT) key, so the same dollars are never stored under two
  // labels/pools. Folded lines (e.g. Direct Travel + Subcontractor Travel) are
  // summed by aggregateDirectCostRows, so the per-key upsert is idempotent.
  let count = 0;
  for (const r of aggregateDirectCostRows(rows)) {
    try {
      await pool.query(
        `INSERT INTO cost_detail_actuals
           (period, fiscal_year, quarter, cost_element, pool,
            target_amount, actual_amount, source, source_doc_id)
         VALUES ($1, $2, $3, $4, 'DIRECT', $5, $6, $8, $7)
         ON CONFLICT (source, period, cost_element, pool)
         DO UPDATE SET
           target_amount = EXCLUDED.target_amount,
           actual_amount = EXCLUDED.actual_amount,
           source_doc_id = EXCLUDED.source_doc_id,
           superseded_at = NULL,
           superseded_reason = NULL`,
        [
          r.period, r.fiscal_year, r.quarter,
          r.cost_element,
          r.target_amount, r.actual_amount,
          sourceDocId ?? null,
          source,
        ],
      );
      count++;
    } catch (err) {
      logger.warn({ err, period: r.period, cost_element: r.cost_element }, 'Cost detail row upsert failed');
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// SIE (Statement of Indirect Expenses) ingest
// ---------------------------------------------------------------------------

type SieRow = SieExtractOutput['rows'][number];

export async function ingestSieRows(
  rows: SieRow[],
  sourceDocId?: number | null,
  source = 'sie',
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row.period || !row.fiscal_year || !row.pool || !row.account_name) continue;
    try {
      await pool.query(
        `INSERT INTO indirect_expense_actuals
           (period, fiscal_year, quarter, pool, account_code, account_name,
            current_period_actual, current_period_budget, ytd_actual, ytd_budget,
            source, source_doc_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $12, $11)
         ON CONFLICT (source, period, pool, COALESCE(account_code, ''), account_name)
         DO UPDATE SET
           current_period_actual = EXCLUDED.current_period_actual,
           current_period_budget = EXCLUDED.current_period_budget,
           ytd_actual = EXCLUDED.ytd_actual,
           ytd_budget = EXCLUDED.ytd_budget,
           source_doc_id = EXCLUDED.source_doc_id`,
        [
          row.period, row.fiscal_year, row.quarter,
          row.pool, row.account_code, row.account_name,
          row.current_period_actual, row.current_period_budget,
          row.ytd_actual, row.ytd_budget,
          sourceDocId ?? null,
          source,
        ],
      );
      count++;
    } catch (err) {
      logger.warn({ err, period: row.period, pool: row.pool }, 'SIE row upsert failed');
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Cost Service Centers ingest — YTD GL Detail INDIRECT rows + SIE pool rates.
// ---------------------------------------------------------------------------

type ServiceCenterRow = ServiceCenterExtractOutput['rows'][number];

/**
 * Snapshot-replace service-center ingest. The YTD GL Detail is one cumulative
 * file per fiscal year (all posted periods PD1..PDn in a single export), so a
 * re-ingest replaces that fiscal year's whole snapshot in one transaction:
 * every stale row is purged and the freshly-parsed set re-inserted. This makes
 * a re-parse self-cleaning and never leaves orphaned service-center rows.
 */
export async function ingestServiceCenterRows(
  rows: ServiceCenterRow[],
  sourceDocId?: number | null,
  source = 'gl_service_center',
): Promise<number> {
  const valid = rows.filter((r) => r.period && r.fiscal_year && r.service_center_id);
  if (valid.length === 0) return 0;

  // Group by fiscal year so each year's snapshot is replaced independently.
  const byFy = new Map<number, ServiceCenterRow[]>();
  for (const r of valid) {
    const list = byFy.get(r.fiscal_year);
    if (list) list.push(r);
    else byFy.set(r.fiscal_year, [r]);
  }

  let count = 0;
  for (const [fy, group] of byFy.entries()) {
    const client = await pool.connect();
    // Tally per-fiscal-year and only fold into the returned total AFTER COMMIT,
    // so a rolled-back batch contributes 0 and is never reported as ingested.
    let seq = 0;
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM service_center_actuals WHERE source = $1 AND fiscal_year = $2`,
        [source, fy],
      );
      for (const row of group) {
        await client.query(
          `INSERT INTO service_center_actuals
             (period, fiscal_year, quarter, month_num, service_center_id,
              service_center_name, pool, org_id, classification, amount,
              source, source_doc_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            row.period, row.fiscal_year, row.quarter, row.month_num,
            row.service_center_id, row.service_center_name, row.pool, row.org_id,
            row.classification, row.amount, source, sourceDocId ?? null,
          ],
        );
        seq++;
      }
      await client.query('COMMIT');
      count += seq;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.warn({ err, fy }, 'Service-center snapshot ingest failed; rolled back to prior snapshot');
    } finally {
      client.release();
    }
  }
  return count;
}

type PoolRateRow = PoolRateExtractOutput['rows'][number];

/**
 * Snapshot-replace pool-rate ingest. The Trend SIE rate summary is one file per
 * fiscal year, so a re-ingest replaces that year's rate snapshot atomically.
 */
export async function ingestPoolRateRows(
  rows: PoolRateRow[],
  sourceDocId?: number | null,
  source = 'sie_pool_rate',
): Promise<number> {
  const valid = rows.filter((r) => r.fiscal_year && r.pool_number && r.pool_name);
  if (valid.length === 0) return 0;

  const byFy = new Map<number, PoolRateRow[]>();
  for (const r of valid) {
    const list = byFy.get(r.fiscal_year);
    if (list) list.push(r);
    else byFy.set(r.fiscal_year, [r]);
  }

  let count = 0;
  for (const [fy, group] of byFy.entries()) {
    const client = await pool.connect();
    // Only fold into the returned total AFTER COMMIT (see ingestServiceCenterRows).
    let seq = 0;
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM indirect_pool_rates WHERE source = $1 AND fiscal_year = $2`,
        [source, fy],
      );
      for (const row of group) {
        await client.query(
          `INSERT INTO indirect_pool_rates
             (fiscal_year, pool_number, pool_name, month_num,
              actual_rate, provisional_rate, source, source_doc_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            row.fiscal_year, row.pool_number, row.pool_name, row.month_num,
            row.actual_rate, row.provisional_rate, source, sourceDocId ?? null,
          ],
        );
        seq++;
      }
      await client.query('COMMIT');
      count += seq;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.warn({ err, fy }, 'Pool-rate snapshot ingest failed; rolled back to prior snapshot');
    } finally {
      client.release();
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Aging-batch plausibility guard (F-625 accuracy)
// ---------------------------------------------------------------------------

/**
 * Deterministic sanity check for a parsed AP/AR batch before it becomes a
 * Financial Bible value. A healthy Open-AP / Aged-AR extract carries real
 * dollars on most rows; a batch of many rows that are (almost) all zero — or one
 * that nets to ~$0 — is the fingerprint of a mis-parsed or mis-routed document
 * (e.g. a Balance Sheet fed to the AP parser, or a wrapped-header parse that lost
 * the amount column, which is exactly how June AP became $463 across 72 rows).
 * Returns a human-facing warning when the batch looks implausible, else null.
 * The caller surfaces it as NEEDS_REVIEW so a bad parse is flagged for a human
 * instead of silently overwriting good numbers.
 */
export function assessAgingBatch(
  label: 'AP' | 'AR',
  rows: { amount: number }[],
): string | null {
  if (rows.length < 5) return null;
  const nonZero = rows.filter((r) => Number.isFinite(r.amount) && r.amount !== 0).length;
  const total = rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  if (nonZero / rows.length < 0.5) {
    return `${label} plausibility: ${rows.length - nonZero} of ${rows.length} parsed rows have a zero amount — likely a mis-parsed or mis-routed document; review before trusting.`;
  }
  if (Math.abs(total) < 1) {
    return `${label} plausibility: ${rows.length} parsed rows net to ~$0 — likely a mis-parsed document; review before trusting.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Accounts Payable (Open AP) ingest (F-625)
// ---------------------------------------------------------------------------

type ApRow = ApExtractOutput['rows'][number];

/**
 * Group parsed rows by their period snapshot, preserving source order so each
 * row's ordinal within its report is stable. Snapshot-replace ingest keys on
 * (source, period, line_seq); grouping lets a single call carry more than one
 * period without cross-period line_seq collisions.
 */
function groupByPeriod<T extends { period: string; fiscal_year: number; quarter: number | null }>(
  rows: T[],
): Map<string, T[]> {
  const byPeriod = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.period}\u0000${row.fiscal_year}\u0000${row.quarter}`;
    const list = byPeriod.get(key);
    if (list) list.push(row);
    else byPeriod.set(key, [row]);
  }
  return byPeriod;
}

/**
 * Snapshot-replace AP ingest (F-625). A period's rows come from exactly one Open
 * AP report, so the whole period is deleted and re-inserted as an ordered set:
 * every parsed voucher persists with a per-report ordinal (line_seq), duplicate
 * vendor+invoice lines are never merged, and a re-ingest self-cleans any rows a
 * prior (mis-)parse left behind. Each period is one transaction so a failed
 * insert rolls back to the previously-good snapshot rather than a partial one.
 */
export async function ingestApRows(
  rows: ApRow[],
  sourceDocId?: number | null,
): Promise<number> {
  const valid = rows.filter((r) => r.period && r.fiscal_year && r.vendor_name);
  let count = 0;
  for (const group of groupByPeriod(valid).values()) {
    const { period, fiscal_year, quarter } = group[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM ap_actuals
           WHERE source = 'open_ap' AND period = $1
             AND fiscal_year = $2 AND quarter IS NOT DISTINCT FROM $3`,
        [period, fiscal_year, quarter ?? null],
      );
      let seq = 0;
      for (const row of group) {
        await client.query(
          `INSERT INTO ap_actuals
             (period, fiscal_year, quarter, vendor_name, invoice_number,
              invoice_date, due_date, amount, age_bucket, status, source, source_doc_id, line_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open_ap', $11, $12)`,
          [
            row.period, row.fiscal_year, row.quarter,
            row.vendor_name, row.invoice_number,
            row.invoice_date, row.due_date,
            row.amount, row.age_bucket, row.status ?? null,
            sourceDocId ?? null, seq,
          ],
        );
        seq++;
      }
      await client.query('COMMIT');
      count += seq;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.warn({ err, period, fiscal_year }, 'AP snapshot ingest failed — rolled back, prior rows kept');
    } finally {
      client.release();
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Accounts Receivable (Aged AR) ingest (F-625)
// ---------------------------------------------------------------------------

type ArRow = ArExtractOutput['rows'][number];

/**
 * Snapshot-replace AR ingest (F-625). Same identity model as AP: a period's rows
 * come from one Aged AR report, so the period is deleted and re-inserted as an
 * ordered set keyed by (source, period, line_seq). Duplicate customer+invoice
 * lines are preserved, and a re-ingest self-cleans stale rows — the double-count
 * that a re-uploaded month previously produced can no longer happen. Per-period
 * transaction so a failed insert rolls back to the prior good snapshot.
 */
export async function ingestArRows(
  rows: ArRow[],
  sourceDocId?: number | null,
): Promise<number> {
  const valid = rows.filter((r) => r.period && r.fiscal_year && r.customer_name);
  let count = 0;
  for (const group of groupByPeriod(valid).values()) {
    const { period, fiscal_year, quarter } = group[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM ar_actuals
           WHERE source = 'aged_ar' AND period = $1
             AND fiscal_year = $2 AND quarter IS NOT DISTINCT FROM $3`,
        [period, fiscal_year, quarter ?? null],
      );
      let seq = 0;
      for (const row of group) {
        await client.query(
          `INSERT INTO ar_actuals
             (period, fiscal_year, quarter, customer_name, invoice_number,
              invoice_date, due_date, amount, age_bucket, source, source_doc_id, line_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'aged_ar', $10, $11)`,
          [
            row.period, row.fiscal_year, row.quarter,
            row.customer_name, row.invoice_number,
            row.invoice_date, row.due_date,
            row.amount, row.age_bucket,
            sourceDocId ?? null, seq,
          ],
        );
        seq++;
      }
      await client.query('COMMIT');
      count += seq;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.warn({ err, period, fiscal_year }, 'AR snapshot ingest failed — rolled back, prior rows kept');
    } finally {
      client.release();
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Trial Balance ingest (F-625)
// ---------------------------------------------------------------------------

type TrialBalanceRow = TrialBalanceExtractOutput['rows'][number];

export async function ingestTrialBalanceRows(
  rows: TrialBalanceRow[],
  sourceDocId?: number | null,
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row.period || !row.fiscal_year || !row.account_code) continue;
    try {
      await pool.query(
        `INSERT INTO trial_balance
           (period, fiscal_year, quarter, account_code, account_name,
            debit, credit, source, source_doc_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'trial_balance', $8)
         ON CONFLICT (source, period, account_code)
         DO UPDATE SET
           account_name = EXCLUDED.account_name,
           debit = EXCLUDED.debit,
           credit = EXCLUDED.credit,
           source_doc_id = EXCLUDED.source_doc_id`,
        [
          row.period, row.fiscal_year, row.quarter,
          row.account_code, row.account_name,
          row.debit, row.credit,
          sourceDocId ?? null,
        ],
      );
      count++;
    } catch (err) {
      logger.warn({ err, period: row.period, account_code: row.account_code }, 'Trial balance row upsert failed');
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Project Revenue Summary ingest (F-625)
// ---------------------------------------------------------------------------

type ProjectRevenueRow = ProjectRevenueExtractOutput['rows'][number];

// project_revenue_actuals.margin_pct is NUMERIC(7,2): representable range is
// [-99999.99, 99999.99]. The parser derives margin from (revenue - cost)/revenue,
// which is unbounded — a loss project with tiny revenue and real cost yields a
// value far outside this range (e.g. -9999900). Inserting it raises a Postgres
// "numeric field overflow", which the per-row try/catch below would swallow,
// silently dropping the row. Null it when it cannot be stored; the row's revenue,
// cost, and generated profit column remain intact, and margin is recomputable.
const PG_NUMERIC_7_2_LIMIT = 99999.99;
function storableMarginPct(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (v > PG_NUMERIC_7_2_LIMIT || v < -PG_NUMERIC_7_2_LIMIT) return null;
  return v;
}

export async function ingestProjectRevenueRows(
  rows: ProjectRevenueRow[],
  sourceDocId?: number | null,
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row.period || !row.fiscal_year || !row.project_name) continue;
    try {
      await pool.query(
        `INSERT INTO project_revenue_actuals
           (period, fiscal_year, quarter, project_name, contract_number, project_id,
            revenue, cost, margin_pct,
            itd_value, itd_funding, itd_billed_amount, open_ar,
            prior_year_costs, prior_year_profit, prior_year_revenue,
            actual_period_costs, actual_period_profit, actual_period_revenue,
            actual_ytd_costs, actual_ytd_profit, actual_ytd_revenue,
            actual_itd_costs, actual_itd_profit, actual_itd_revenue,
            target_period_costs, target_period_profit, target_period_revenue,
            target_ytd_costs, target_ytd_profit, target_ytd_revenue,
            target_itd_costs, target_itd_profit, target_itd_revenue,
            source, source_doc_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 $10, $11, $12, $13,
                 $14, $15, $16,
                 $17, $18, $19,
                 $20, $21, $22,
                 $23, $24, $25,
                 $26, $27, $28,
                 $29, $30, $31,
                 $32, $33, $34,
                 'proj_revenue', $35)
         ON CONFLICT (source, period, project_name, (COALESCE(project_id, '')))
         DO UPDATE SET
           contract_number = EXCLUDED.contract_number,
           project_id = EXCLUDED.project_id,
           revenue = EXCLUDED.revenue,
           cost = EXCLUDED.cost,
           margin_pct = EXCLUDED.margin_pct,
           itd_value = EXCLUDED.itd_value,
           itd_funding = EXCLUDED.itd_funding,
           itd_billed_amount = EXCLUDED.itd_billed_amount,
           open_ar = EXCLUDED.open_ar,
           prior_year_costs = EXCLUDED.prior_year_costs,
           prior_year_profit = EXCLUDED.prior_year_profit,
           prior_year_revenue = EXCLUDED.prior_year_revenue,
           actual_period_costs = EXCLUDED.actual_period_costs,
           actual_period_profit = EXCLUDED.actual_period_profit,
           actual_period_revenue = EXCLUDED.actual_period_revenue,
           actual_ytd_costs = EXCLUDED.actual_ytd_costs,
           actual_ytd_profit = EXCLUDED.actual_ytd_profit,
           actual_ytd_revenue = EXCLUDED.actual_ytd_revenue,
           actual_itd_costs = EXCLUDED.actual_itd_costs,
           actual_itd_profit = EXCLUDED.actual_itd_profit,
           actual_itd_revenue = EXCLUDED.actual_itd_revenue,
           target_period_costs = EXCLUDED.target_period_costs,
           target_period_profit = EXCLUDED.target_period_profit,
           target_period_revenue = EXCLUDED.target_period_revenue,
           target_ytd_costs = EXCLUDED.target_ytd_costs,
           target_ytd_profit = EXCLUDED.target_ytd_profit,
           target_ytd_revenue = EXCLUDED.target_ytd_revenue,
           target_itd_costs = EXCLUDED.target_itd_costs,
           target_itd_profit = EXCLUDED.target_itd_profit,
           target_itd_revenue = EXCLUDED.target_itd_revenue,
           source_doc_id = EXCLUDED.source_doc_id`,
        [
          row.period, row.fiscal_year, row.quarter,
          row.project_name, row.contract_number, row.project_id ?? null,
          row.revenue, row.cost, storableMarginPct(row.margin_pct),
          row.itd_value ?? 0, row.itd_funding ?? 0, row.itd_billed_amount ?? 0, row.open_ar ?? 0,
          row.prior_year_costs ?? 0, row.prior_year_profit ?? 0, row.prior_year_revenue ?? 0,
          row.actual_period_costs ?? 0, row.actual_period_profit ?? 0, row.actual_period_revenue ?? 0,
          row.actual_ytd_costs ?? 0, row.actual_ytd_profit ?? 0, row.actual_ytd_revenue ?? 0,
          row.actual_itd_costs ?? 0, row.actual_itd_profit ?? 0, row.actual_itd_revenue ?? 0,
          row.target_period_costs ?? 0, row.target_period_profit ?? 0, row.target_period_revenue ?? 0,
          row.target_ytd_costs ?? 0, row.target_ytd_profit ?? 0, row.target_ytd_revenue ?? 0,
          row.target_itd_costs ?? 0, row.target_itd_profit ?? 0, row.target_itd_revenue ?? 0,
          sourceDocId ?? null,
        ],
      );
      count++;
    } catch (err) {
      logger.warn({ err, period: row.period, project_name: row.project_name }, 'Project revenue row upsert failed');
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Per-contract Revenue Summary by Cost Pool ingest.
//
// The cost-pool book is the authoritative per-contract actuals source: it gives
// real monthly revenue / fully-burdened cost / Op Income / margin per contract,
// but no ITD or target/plan figures. The older "Full Proj Revenue Summary" book
// carries per-contract ITD (contract value / funding / billed) but ships EMPTY
// period/YTD actuals. The two books share one contract-id space (L2 Proj ID), so
// we merge rather than replace: for periods that already have Full-Proj ITD rows
// (Jan–May) we UPDATE the matching contract's actuals in place, preserving ITD;
// for cost-pool-only periods (e.g. Jun, which has no Full-Proj file) we
// snapshot-replace the period so re-ingest is lossless. YTD actuals are derived
// here by cumulatively summing the monthly rows per contract — never taken from
// ITD. Target/plan columns are left at their defaults (unavailable, per R1).
// ---------------------------------------------------------------------------

type ProjectCostPoolRow = ProjectCostPoolExtractOutput['rows'][number];

export async function ingestProjectCostPoolRows(
  rows: ProjectCostPoolRow[],
  sourceDocId?: number | null,
): Promise<number> {
  const valid = rows.filter((r) => r.period && r.fiscal_year && r.project_id);

  const byFy = new Map<number, ProjectCostPoolRow[]>();
  for (const r of valid) {
    const arr = byFy.get(r.fiscal_year) ?? [];
    arr.push(r);
    byFy.set(r.fiscal_year, arr);
  }

  let count = 0;
  for (const [fy, fyRows] of byFy.entries()) {
    // Cumulative YTD per contract, in fiscal-period order.
    const acc = new Map<string, { rev: number; cost: number; profit: number }>();
    const ytdByKey = new Map<string, { rev: number; cost: number; profit: number }>();
    for (const r of [...fyRows].sort((a, b) => a.month_num - b.month_num)) {
      const a = acc.get(r.contract_number ?? r.project_id) ?? { rev: 0, cost: 0, profit: 0 };
      a.rev = Math.round((a.rev + r.revenue) * 100) / 100;
      a.cost = Math.round((a.cost + r.cost) * 100) / 100;
      a.profit = Math.round((a.profit + r.profit) * 100) / 100;
      acc.set(r.contract_number ?? r.project_id, { ...a });
      ytdByKey.set(`${r.period}|||${r.contract_number ?? r.project_id}`, { ...a });
    }

    const client = await pool.connect();
    let localCount = 0;
    try {
      await client.query('BEGIN');

      // A period is "cost-pool-only" when no Full-Proj ITD row backs it; such a
      // period can be snapshot-replaced. Periods with ITD rows are merged so the
      // ITD data is preserved.
      const periods = [...new Set(fyRows.map((r) => r.period))];
      const costPoolOnly = new Set<string>();
      for (const p of periods) {
        const res = await client.query(
          `SELECT 1 FROM project_revenue_actuals
             WHERE source = 'proj_revenue' AND period = $1
               AND (COALESCE(itd_value,0) <> 0 OR COALESCE(itd_funding,0) <> 0
                    OR COALESCE(itd_billed_amount,0) <> 0)
             LIMIT 1`,
          [p],
        );
        if (res.rowCount === 0) costPoolOnly.add(p);
      }
      for (const p of costPoolOnly) {
        await client.query(
          `DELETE FROM project_revenue_actuals WHERE source = 'proj_revenue' AND period = $1`,
          [p],
        );
      }

      for (const r of fyRows) {
        const key = `${r.period}|||${r.contract_number ?? r.project_id}`;
        const y = ytdByKey.get(key) ?? { rev: r.revenue, cost: r.cost, profit: r.profit };
        const margin = storableMarginPct(r.margin_pct);

        if (!costPoolOnly.has(r.period)) {
          const upd = await client.query(
            `UPDATE project_revenue_actuals SET
               project_id = $1, revenue = $2, cost = $3, margin_pct = $4,
               actual_period_revenue = $5, actual_period_costs = $6, actual_period_profit = $7,
               actual_ytd_revenue = $8, actual_ytd_costs = $9, actual_ytd_profit = $10,
               source_doc_id = $11
             WHERE source = 'proj_revenue' AND period = $12 AND contract_number = $13`,
            [
              r.project_id, r.revenue, r.cost, margin,
              r.revenue, r.cost, r.profit,
              y.rev, y.cost, y.profit,
              sourceDocId ?? null, r.period, r.contract_number,
            ],
          );
          if (upd.rowCount && upd.rowCount > 0) {
            localCount += upd.rowCount;
            continue;
          }
        }

        await client.query(
          `INSERT INTO project_revenue_actuals
             (period, fiscal_year, quarter, project_name, contract_number, project_id,
              revenue, cost, margin_pct,
              actual_period_revenue, actual_period_costs, actual_period_profit,
              actual_ytd_revenue, actual_ytd_costs, actual_ytd_profit,
              source, source_doc_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                   'proj_revenue', $16)
           ON CONFLICT (source, period, project_name, (COALESCE(project_id, '')))
           DO UPDATE SET
             contract_number = EXCLUDED.contract_number,
             project_id = EXCLUDED.project_id,
             revenue = EXCLUDED.revenue,
             cost = EXCLUDED.cost,
             margin_pct = EXCLUDED.margin_pct,
             actual_period_revenue = EXCLUDED.actual_period_revenue,
             actual_period_costs = EXCLUDED.actual_period_costs,
             actual_period_profit = EXCLUDED.actual_period_profit,
             actual_ytd_revenue = EXCLUDED.actual_ytd_revenue,
             actual_ytd_costs = EXCLUDED.actual_ytd_costs,
             actual_ytd_profit = EXCLUDED.actual_ytd_profit,
             source_doc_id = EXCLUDED.source_doc_id`,
          [
            r.period, r.fiscal_year, r.quarter, r.project_name, r.contract_number, r.project_id,
            r.revenue, r.cost, margin,
            r.revenue, r.cost, r.profit,
            y.rev, y.cost, y.profit,
            sourceDocId ?? null,
          ],
        );
        localCount++;
      }

      await client.query('COMMIT');
      count += localCount;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.warn({ err, fiscal_year: fy }, 'Cost-pool project ingest failed — rolled back, prior rows kept');
    } finally {
      client.release();
    }
  }
  return count;
}
