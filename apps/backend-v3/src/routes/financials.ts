import type { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import type { FinancialAnalyzeInput } from '../lib/llm-router.types.js';
import { recordAuditLog } from '../services/audit/audit-log.js';
import { parseCalendarMode, getMonthsForMode, fiscalMonthIndex, type CalendarMode } from '../lib/fiscal-calendar.js';
import { classifyFinancialDoc } from '../services/financials/reingest-doc.js';
import {
  classifyCoverage,
  primaryTypeOf,
  handlerMatched,
  inferDocPeriod,
  type CoverageDocInput,
} from '../services/financials/coverage.js';

// Live, user-specific financials read from the DB on every request. They must
// never be served from an HTTP cache (browser/proxy) or a 304 revalidation,
// otherwise the UI shows a stale/empty body even after the data lands. Mark
// these responses no-store and strip any validator that could trigger a 304.
function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
  reply.removeHeader('ETag');
  reply.removeHeader('Last-Modified');
}

/**
 * Parse a fiscal-year query param ("FY26", "FY2026", "2026") into a full
 * 4-digit year.  Two-digit shorthand (< 100) is expanded to 2000+.
 */
function normalizeFiscalYear(fy: string, fallback = 2026): number {
  const raw = parseInt(fy.replace(/\D/g, ''), 10);
  if (!raw || Number.isNaN(raw)) return fallback;
  return raw < 100 ? raw + 2000 : raw;
}

export async function financialsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/kpi/header
  // Executive KPI header — sums CY-to-date or FY-to-date monthly rows.
  // Source precedence: income_statement > l1_actual (DISTINCT ON period).
  // Backlog metrics come from task_orders (is_seed=false).
  app.get('/v3/kpi/header', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const mode: CalendarMode = query.calendarMode === 'FY' ? 'FY' : 'CY';

    // Determine the current month abbreviation and fiscal year
    const now = new Date();
    const currentCalMonth = now.getMonth() + 1; // 1-based
    const currentYear = now.getFullYear();
    // Fiscal year label: if month >= Oct (10), FY = year+1; otherwise FY = year
    const currentFY = currentCalMonth >= 10 ? currentYear + 1 : currentYear;

    // DB period convention: "FY<YY> <Mon>" where YY = calendar year of the month
    // (e.g. Oct 2025 → "FY25 Oct", Jan 2026 → "FY26 Jan")
    const MONTH_CAL_NUM: Record<string, number> = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const MONTH_ABBREVS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const currentMonthAbbrev = MONTH_ABBREVS[currentCalMonth - 1];
    const months = getMonthsForMode(mode);

    // Build period strings with the correct calendar-year prefix per month.
    // CY mode: all months are in currentYear.
    // FY mode: Oct-Dec are in the previous calendar year when currentCalMonth < 10.
    const periodStrings: string[] = [];
    for (const m of months) {
      let calYear = currentYear;
      if (mode === 'FY' && MONTH_CAL_NUM[m.mon] >= 10 && currentCalMonth < 10) {
        calYear = currentYear - 1;
      }
      periodStrings.push(`FY${calYear % 100} ${m.mon}`);
      if (m.mon === currentMonthAbbrev) break;
    }

    // Query monthly actuals with source precedence (income_statement > l1_actual)
    // DISTINCT ON (period) keeps only the highest-priority source per month
    let orders = 0;
    let sales = 0;
    let ebit = 0;
    let grossProfit = 0;
    let grossMarginSales = 0;

    if (periodStrings.length > 0) {
      const { rows: actualsRows } = await pool.query(
        `SELECT source, actual_orders, actual_sales, actual_ebit, actual_gross_margin
         FROM (
           SELECT DISTINCT ON (period)
             period, source, actual_orders, actual_sales, actual_ebit, actual_gross_margin
           FROM financial_actuals
           WHERE period = ANY($1)
             AND source IN ('income_statement', 'l1_actual')
             AND is_seed = false
             AND period NOT LIKE '%Q%'
             -- Exclude phantom periods that carry no P&L signal (e.g. an
             -- orders-only row for a month with no ingested actuals), so a
             -- backlog/orders figure can never surface as Orders in the header.
             AND (
               COALESCE(actual_sales, 0) <> 0
               OR COALESCE(actual_ebit, 0) <> 0
               OR COALESCE(actual_gross_margin, 0) <> 0
             )
           ORDER BY period,
             CASE source WHEN 'income_statement' THEN 1 ELSE 2 END
         ) ranked`,
        [periodStrings],
      );

      for (const r of actualsRows) {
        const monthlySales = Number(r.actual_sales) || 0;
        let monthlyGrossMargin = Number(r.actual_gross_margin);
        if (r.source === 'l1_actual' && Math.abs(monthlyGrossMargin) <= 1.5) {
          monthlyGrossMargin *= 100;
        }

        orders += Number(r.actual_orders) || 0;
        sales += monthlySales;
        ebit += Number(r.actual_ebit) || 0;
        if (Number.isFinite(monthlyGrossMargin) && monthlySales !== 0) {
          grossProfit += monthlySales * (monthlyGrossMargin / 100);
          grossMarginSales += monthlySales;
        }
      }
    }

    const grossMargin = grossMarginSales !== 0 ? (grossProfit / grossMarginSales) * 100 : 0;
    const ros = sales !== 0 ? (ebit / sales) * 100 : 0;

    // Backlog metrics from task_orders (real data only)
    const { rows: backlogRows } = await pool.query(
      `SELECT
         COALESCE(SUM(funded_to_date), 0) AS funded_backlog,
         COALESCE(SUM(total_ceiling), 0) AS backlog
       FROM task_orders
       WHERE is_seed = false`,
    );
    const fundedBacklog = Number(backlogRows[0]?.funded_backlog) || 0;
    const backlog = Number(backlogRows[0]?.backlog) || 0;

    // Period label for the response
    const periodLabel = mode === 'CY'
      ? `CY${currentYear % 100} to date`
      : `FY${currentFY % 100} to date`;

    const data = {
      period: periodLabel,
      orders: { value: orders, delta: null, plan: null },
      sales: { value: sales, delta: null, plan: null },
      gross_margin: { value: grossMargin, delta: null, plan: null },
      ebit: { value: ebit, delta: null, plan: null },
      ros: { value: ros, delta: null, plan: null },
      funded_backlog: { value: fundedBacklog, delta: null, plan: null },
      backlog: { value: backlog, delta: null, plan: null },
    };

    return reply.send(successEnvelope(data, req.requestId));
  });

  // GET /v3/financials/forecast
  // Quarter-level target vs actuals. BUG 5: l1_target now lives in
  // financial_actuals (company-P&L target series), not financial_plan, so read
  // the target quarter rows (actual_* columns under source l1_target) and join
  // them against the income_statement actuals quarter rows (period LIKE '%Q%')
  // so the join stays 1:1 per quarter.
  app.get('/v3/financials/forecast', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT
         t.period,
         t.actual_orders AS plan_orders,
         t.actual_sales  AS plan_sales,
         COALESCE(a.actual_orders, 0) AS actual_orders,
         COALESCE(a.actual_sales, 0)  AS actual_sales,
         (a.id IS NOT NULL) AS has_actuals
       FROM financial_actuals t
       LEFT JOIN financial_actuals a
         ON a.fiscal_year = t.fiscal_year AND a.quarter = t.quarter
        AND a.source = 'income_statement' AND a.period LIKE '%Q%'
       WHERE t.source = 'l1_target' AND t.period LIKE '%Q%'
       ORDER BY t.fiscal_year, t.quarter`,
    );

    const items = rows.map((r) => ({
      period: r.period as string,
      plan_orders: Number(r.plan_orders),
      plan_sales: Number(r.plan_sales),
      actual_orders: Number(r.actual_orders),
      actual_sales: Number(r.actual_sales),
      has_actuals: Boolean(r.has_actuals),
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/financials/trend
  // Returns month rows AND the derived quarter-total rows for every actuals
  // source-series (income_statement, l1_actual). `source` and `is_quarter` are
  // exposed so the Financials tab can label the series and visually separate the
  // quarter total from its months.
  app.get('/v3/financials/trend', async (req, reply) => {
    // Trend rule: quarter rows (period LIKE '%Q%') are recomputed aggregates and
    // always kept; monthly rows must carry a real sales/ebit/gross-margin signal,
    // so an orders-only period (the June phantom bug) is excluded from the series.
    // IS#2: DISTINCT ON dedup — income_statement > l1_actual per period.
    // IS#3: Normalize gross-margin units (l1_actual stores fraction, IS stores %).
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (period)
              source, period, fiscal_year, quarter,
              (period LIKE '%Q%') AS is_quarter,
              actual_orders AS orders, actual_sales AS sales,
              actual_ebit AS ebit,
              CASE WHEN source = 'l1_actual' THEN actual_gross_margin * 100
                   ELSE actual_gross_margin END AS gross_margin,
              actual_ros AS ros
       FROM financial_actuals
       WHERE source IN ('income_statement', 'l1_actual')
         AND (
           period LIKE '%Q%'
           OR COALESCE(actual_sales, 0) <> 0
           OR COALESCE(actual_ebit, 0) <> 0
           OR COALESCE(actual_gross_margin, 0) <> 0
         )
       ORDER BY period,
                CASE source WHEN 'income_statement' THEN 0 WHEN 'l1_actual' THEN 1 ELSE 2 END`,
    );

    // IS#1: Sort by fiscal month order, not alphabetical
    const items = rows.map((r) => ({
      source: r.source as string,
      period: r.period as string,
      is_quarter: Boolean(r.is_quarter),
      orders: Number(r.orders),
      sales: Number(r.sales),
      ebit: Number(r.ebit),
      gross_margin: Number(r.gross_margin),
      ros: Number(r.ros),
    }));

    items.sort((a, b) => {
      const aQ = a.is_quarter ? 1 : 0;
      const bQ = b.is_quarter ? 1 : 0;
      if (aQ !== bQ) return aQ - bQ;
      const aMonth = a.period.split(' ')[1] || '';
      const bMonth = b.period.split(' ')[1] || '';
      return fiscalMonthIndex(aMonth) - fiscalMonthIndex(bMonth);
    });

    // BUG 5: per-period actual-vs-target variance. Target is the company-P&L
    // target series (source l1_target); actual prefers the company-P&L actual
    // series (l1_actual) and falls back to income_statement when l1_actual is
    // absent for that period, so a period with a target always resolves an
    // actual counterpart. variance = actual - target for each dollar metric.
    const { rows: varRows } = await pool.query(
      `SELECT
         t.period, t.fiscal_year, t.quarter,
         (t.period LIKE '%Q%') AS is_quarter,
         a.actual_orders AS actual_orders, a.actual_sales AS actual_sales, a.actual_ebit AS actual_ebit,
         t.actual_orders AS target_orders, t.actual_sales AS target_sales, t.actual_ebit AS target_ebit
       FROM financial_actuals t
       LEFT JOIN LATERAL (
         SELECT x.actual_orders, x.actual_sales, x.actual_ebit
           FROM financial_actuals x
          WHERE x.period = t.period AND x.fiscal_year = t.fiscal_year AND x.quarter = t.quarter
            AND x.source IN ('l1_actual', 'income_statement')
          ORDER BY CASE x.source WHEN 'l1_actual' THEN 0 ELSE 1 END
          LIMIT 1
       ) a ON true
       WHERE t.source = 'l1_target'
       ORDER BY t.fiscal_year, t.quarter`,
    );

    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    const diff = (act: number | null, tgt: number | null): number | null =>
      act === null || tgt === null ? null : act - tgt;

    const variance = varRows.map((r) => {
      const actualSales = num(r.actual_sales);
      const actualEbit = num(r.actual_ebit);
      const actualOrders = num(r.actual_orders);
      const targetSales = num(r.target_sales);
      const targetEbit = num(r.target_ebit);
      const targetOrders = num(r.target_orders);
      return {
        period: r.period as string,
        is_quarter: Boolean(r.is_quarter),
        actual_orders: actualOrders,
        actual_sales: actualSales,
        actual_ebit: actualEbit,
        target_orders: targetOrders,
        target_sales: targetSales,
        target_ebit: targetEbit,
        orders_variance: diff(actualOrders, targetOrders),
        sales_variance: diff(actualSales, targetSales),
        ebit_variance: diff(actualEbit, targetEbit),
      };
    });

    variance.sort((a, b) => {
      const aQ = a.is_quarter ? 1 : 0;
      const bQ = b.is_quarter ? 1 : 0;
      if (aQ !== bQ) return aQ - bQ;
      const aMonth = a.period.split(' ')[1] || '';
      const bMonth = b.period.split(' ')[1] || '';
      return fiscalMonthIndex(aMonth) - fiscalMonthIndex(bMonth);
    });

    return reply.send(successEnvelope({ items, variance }, req.requestId));
  });

  // GET /v3/financials/plan
  app.get('/v3/financials/plan', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM financial_plan ORDER BY fiscal_year, quarter`,
    );

    return reply.send(successEnvelope({ items: rows }, req.requestId));
  });

  // GET /v3/financials/balance-sheet
  // Returns balance sheet actuals, latest period first, plus trend data.
  app.get('/v3/financials/balance-sheet', async (req, reply) => {
    noStore(reply);
    const { rows } = await pool.query(
      `SELECT period, fiscal_year, quarter, source,
              cash, accounts_receivable,
              total_current_assets, total_assets,
              accounts_payable, total_current_liabilities,
              total_liabilities, total_equity
       FROM balance_sheet_actuals
       ORDER BY fiscal_year DESC, quarter DESC NULLS LAST, period DESC`,
    );

    if (!rows.length) {
      return reply.send(successEnvelope({ latest: null, trend: [] }, req.requestId));
    }

    const mapped = rows.map((r) => ({
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: r.quarter !== null ? Number(r.quarter) : null,
      cash: Number(r.cash),
      accounts_receivable: Number(r.accounts_receivable),
      total_current_assets: Number(r.total_current_assets),
      total_assets: Number(r.total_assets),
      accounts_payable: Number(r.accounts_payable),
      total_current_liabilities: Number(r.total_current_liabilities),
      total_liabilities: Number(r.total_liabilities),
      total_equity: Number(r.total_equity),
    }));

    return reply.send(successEnvelope({ latest: mapped[0], trend: mapped }, req.requestId));
  });

  // GET /v3/financials/period-detail?period=FY26+Q1
  // Drill-down: all line items for a period (actuals + plan side-by-side)
  // plus linked vault source documents.
  app.get('/v3/financials/period-detail', async (req, reply) => {
    const period = (req.query as Record<string, string>).period;
    if (!period) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'period query param required', req.requestId));
    }

    const { rows: actuals } = await pool.query(
      `SELECT source, actual_orders AS orders, actual_sales AS sales,
              actual_ebit AS ebit, actual_gross_margin AS gross_margin,
              actual_ros AS ros
       FROM financial_actuals
       WHERE period = $1`,
      [period],
    );

    const { rows: plans } = await pool.query(
      `SELECT source, plan_orders AS orders, plan_sales AS sales,
              plan_ebit AS ebit, plan_gross_margin AS gross_margin,
              plan_ros AS ros
       FROM financial_plan
       WHERE period = $1`,
      [period],
    );

    // Find vault documents that match the period (fuzzy filename match)
    const { rows: docs } = await pool.query(
      `SELECT id, filename, doc_type, file_path, uploaded_at
       FROM vault_documents
       WHERE deleted_at IS NULL
         AND (doc_type = 'financial' OR doc_type = 'other')
       ORDER BY uploaded_at DESC`,
    );

    return reply.send(successEnvelope({
      period,
      actuals: actuals.map((r) => ({
        source: r.source as string,
        orders: Number(r.orders),
        sales: Number(r.sales),
        ebit: Number(r.ebit),
        gross_margin: Number(r.gross_margin),
        ros: Number(r.ros),
      })),
      plans: plans.map((r) => ({
        source: r.source as string,
        orders: Number(r.orders),
        sales: Number(r.sales),
        ebit: Number(r.ebit),
        gross_margin: Number(r.gross_margin),
        ros: Number(r.ros),
      })),
      source_documents: docs.map((d) => ({
        id: Number(d.id),
        filename: d.filename as string,
        doc_type: d.doc_type as string,
        uploaded_at: d.uploaded_at as string,
      })),
    }, req.requestId));
  });

  // GET /v3/financials/cost-detail?period=FY26+Jan
  // Cost element × pool matrix for a specific period
  app.get('/v3/financials/cost-detail', async (req, reply) => {
    const period = (req.query as Record<string, string>).period;
    const whereClause = period ? 'WHERE period = $1' : '';
    const params = period ? [period] : [];

    // Per-period source preference: the deterministic Trended Income Statement
    // (source income_statement) is the authoritative, reconcilable dollar figure,
    // so when it exists for a period we return ONLY those rows and hide the legacy
    // tgt_vs_act rows (which summed to garbage / cents). Falls back to legacy for
    // any period the income statement never covered. Non-destructive: both source
    // rows remain in the table.
    const { rows } = await pool.query(
      `WITH ranked AS (
         SELECT period, fiscal_year, quarter, cost_element, pool,
                target_amount, actual_amount, variance_amount,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM cost_detail_actuals
         ${whereClause}
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period)
       SELECT r.period, r.fiscal_year, r.quarter, r.cost_element, r.pool,
              r.target_amount, r.actual_amount, r.variance_amount
       FROM ranked r
       JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       ORDER BY r.cost_element, r.pool`,
      params,
    );

    const items = rows.map((r) => ({
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: Number(r.quarter),
      cost_element: r.cost_element as string,
      pool: r.pool as string,
      target_amount: Number(r.target_amount),
      actual_amount: Number(r.actual_amount),
      variance_amount: Number(r.variance_amount),
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/financials/cost-detail/trend
  // All periods, all cost elements
  app.get('/v3/financials/cost-detail/trend', async (req, reply) => {
    // Same per-period income_statement-first source preference as the single
    // period route, applied across all periods (see that route for rationale).
    const { rows } = await pool.query(
      `WITH ranked AS (
         SELECT period, fiscal_year, quarter, cost_element, pool,
                target_amount, actual_amount, variance_amount,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM cost_detail_actuals
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period)
       SELECT r.period, r.fiscal_year, r.quarter, r.cost_element, r.pool,
              r.target_amount, r.actual_amount, r.variance_amount
       FROM ranked r
       JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       ORDER BY r.fiscal_year, r.quarter, r.period, r.cost_element, r.pool`,
    );

    const items = rows.map((r) => ({
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: Number(r.quarter),
      cost_element: r.cost_element as string,
      pool: r.pool as string,
      target_amount: Number(r.target_amount),
      actual_amount: Number(r.actual_amount),
      variance_amount: Number(r.variance_amount),
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/financials/indirect-expenses?period=FY26+Jan
  // Indirect expense breakdown by pool for a specific period
  app.get('/v3/financials/indirect-expenses', async (req, reply) => {
    const period = (req.query as Record<string, string>).period;
    const whereClause = period ? 'WHERE period = $1' : '';
    const params = period ? [period] : [];

    // Per-period source preference: prefer the deterministic income_statement
    // indirect rows (real per-account dollars reconciling to Total Cost of
    // Operations) over the legacy sie rows (which carried rates / cents). Falls
    // back to legacy for uncovered periods. Non-destructive.
    const { rows } = await pool.query(
      `WITH ranked AS (
         SELECT period, fiscal_year, quarter, pool, account_code, account_name,
                current_period_actual, current_period_budget, ytd_actual, ytd_budget,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM indirect_expense_actuals
         ${whereClause}
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period)
       SELECT r.period, r.fiscal_year, r.quarter, r.pool, r.account_code, r.account_name,
              r.current_period_actual, r.current_period_budget, r.ytd_actual, r.ytd_budget
       FROM ranked r
       JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       ORDER BY r.pool, r.account_code NULLS LAST, r.account_name`,
      params,
    );

    const items = rows.map((r) => ({
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: Number(r.quarter),
      pool: r.pool as string,
      account_code: r.account_code as string | null,
      account_name: r.account_name as string,
      current_period_actual: Number(r.current_period_actual),
      current_period_budget: Number(r.current_period_budget),
      ytd_actual: Number(r.ytd_actual),
      ytd_budget: Number(r.ytd_budget),
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/financials/indirect-expenses/trend
  // Time series of total indirect by pool
  app.get('/v3/financials/indirect-expenses/trend', async (req, reply) => {
    // Aggregate per pool AFTER applying the per-period income_statement-first
    // source preference, so a period's totals never mix authoritative and legacy
    // rows (see /indirect-expenses for rationale).
    const { rows } = await pool.query(
      `WITH ranked AS (
         SELECT period, fiscal_year, quarter, pool,
                current_period_actual, current_period_budget, ytd_actual, ytd_budget,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM indirect_expense_actuals
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period),
       preferred AS (
         SELECT r.* FROM ranked r
         JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       )
       SELECT period, fiscal_year, quarter, pool,
              SUM(current_period_actual) AS period_actual,
              SUM(current_period_budget) AS period_budget,
              SUM(ytd_actual) AS ytd_actual,
              SUM(ytd_budget) AS ytd_budget
       FROM preferred
       GROUP BY period, fiscal_year, quarter, pool
       ORDER BY fiscal_year, quarter, period, pool`,
    );

    const items = rows.map((r) => ({
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: Number(r.quarter),
      pool: r.pool as string,
      period_actual: Number(r.period_actual),
      period_budget: Number(r.period_budget),
      ytd_actual: Number(r.ytd_actual),
      ytd_budget: Number(r.ytd_budget),
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/financials/data-coverage
  // Shows which periods have actuals, which have plan, and which vault
  // uploads are financial-type (for the Data Coverage callout).
  app.get('/v3/financials/data-coverage', async (req, reply) => {
    const { rows: actualPeriods } = await pool.query(
      `SELECT DISTINCT period, source FROM financial_actuals ORDER BY period`,
    );
    const { rows: planPeriods } = await pool.query(
      `SELECT DISTINCT period, source FROM financial_plan ORDER BY period`,
    );
    const { rows: vaultDocs } = await pool.query(
      `SELECT id, filename, doc_type, uploaded_at
       FROM vault_documents
       WHERE deleted_at IS NULL
         AND (doc_type = 'financial' OR doc_type = 'other')
       ORDER BY uploaded_at DESC`,
    );

    return reply.send(successEnvelope({
      actuals: actualPeriods.map((r) => ({ period: r.period as string, source: r.source as string })),
      plans: planPeriods.map((r) => ({ period: r.period as string, source: r.source as string })),
      vault_documents: vaultDocs.map((d) => ({
        id: Number(d.id),
        filename: d.filename as string,
        doc_type: d.doc_type as string,
        uploaded_at: d.uploaded_at as string,
      })),
    }, req.requestId));
  });

  // ─── AP / AR / Trial Balance / Project Revenue endpoints (F-625) ───

  // GET /v3/financials/ap
  app.get('/v3/financials/ap', async (req, reply) => {
    noStore(reply);
    const { rows } = await pool.query(
      `SELECT id, period, fiscal_year, quarter, vendor_name, invoice_number,
              invoice_date, due_date, amount, age_bucket, source_doc_id, created_at
       FROM ap_actuals
       ORDER BY fiscal_year DESC, quarter DESC, period DESC, vendor_name`,
    );
    const items = rows.map((r) => ({
      id: Number(r.id),
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: r.quarter != null ? Number(r.quarter) : null,
      vendor_name: r.vendor_name as string,
      invoice_number: (r.invoice_number as string) ?? null,
      invoice_date: (r.invoice_date as string) ?? null,
      due_date: (r.due_date as string) ?? null,
      amount: Number(r.amount),
      age_bucket: (r.age_bucket as string) ?? null,
      source_doc_id: r.source_doc_id != null ? Number(r.source_doc_id) : null,
    }));
    return reply.send(successEnvelope({
      items,
      meta: { table: 'ap_actuals', row_count: items.length },
    }, req.requestId));
  });

  // GET /v3/financials/ar
  app.get('/v3/financials/ar', async (req, reply) => {
    noStore(reply);
    const { rows } = await pool.query(
      `SELECT id, period, fiscal_year, quarter, customer_name, invoice_number,
              invoice_date, due_date, amount, age_bucket, source_doc_id, created_at
       FROM ar_actuals
       ORDER BY fiscal_year DESC, quarter DESC, period DESC, customer_name`,
    );
    const items = rows.map((r) => ({
      id: Number(r.id),
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: r.quarter != null ? Number(r.quarter) : null,
      customer_name: r.customer_name as string,
      invoice_number: (r.invoice_number as string) ?? null,
      invoice_date: (r.invoice_date as string) ?? null,
      due_date: (r.due_date as string) ?? null,
      amount: Number(r.amount),
      age_bucket: (r.age_bucket as string) ?? null,
      source_doc_id: r.source_doc_id != null ? Number(r.source_doc_id) : null,
    }));
    return reply.send(successEnvelope({
      items,
      meta: { table: 'ar_actuals', row_count: items.length },
    }, req.requestId));
  });

  // GET /v3/financials/ar/by-contract?mode=CY|FY
  // Contract × month matrix derived from ar_actuals using invoice/customer classification.
  app.get('/v3/financials/ar/by-contract', async (req, reply) => {
    noStore(reply);
    const query = req.query as Record<string, string | undefined>;
    const mode: CalendarMode = query.mode === 'CY' ? 'CY' : 'FY';

    const { rows } = await pool.query(
      `SELECT period, fiscal_year, quarter, customer_name, invoice_number, amount
       FROM ar_actuals
       ORDER BY fiscal_year, quarter, period`,
    );

    // Classification logic per ar_by_contract.md §3
    // Army invoices: extract task-order suffix after the last "-" (BVN####-F####
    // format) so the F?#### regex never false-matches a BVN number.
    // Non-Army: bucket by customer_name, NOT the shared INV- prefix.
    function classifyContract(customerName: string, invoiceNumber: string | null): string {
      const inv = invoiceNumber ?? '';
      const cust = customerName ?? '';
      const isArmy = /army/i.test(cust);

      if (isArmy) {
        // Extract task-order suffix (part after last dash); bare "0028" stays as-is
        const suffix = inv.includes('-') ? inv.slice(inv.lastIndexOf('-') + 1) : inv;
        // Strip R/TR retention/revision suffixes (e.g. F0209R, F0038TR)
        const stripped = suffix.replace(/[RT]+$/i, '');
        if (/F?0016/i.test(stripped)) return 'STEP (F0016)';
        if (/F?0028/i.test(stripped)) return 'PEO IEWS SETA (F0028)';
        if (/F?0209/i.test(stripped)) return 'C5ISR (F0209)';
        if (/F?0038/i.test(stripped)) return 'CECOM (F0038)';
        if (/FA010/i.test(stripped)) return 'FORCE (FA010)';
        return 'Army-other/adjustment';
      }

      // Non-Army: bucket by customer_name (+ invoice prefix where applicable)
      if (/^GSA/i.test(cust)) return 'PM Mission Command (GSA)';
      if (/Sev1/i.test(cust) || /^SEV1-/i.test(inv)) return 'Sev1Tech \u2014 CP IS&W';
      if (/Booz/i.test(cust) || /^PDNET/i.test(inv)) return 'Booz Allen \u2014 NEBULA';
      if (/Nakupuna/i.test(cust)) return 'Nakupuna \u2014 C5ISR CIO';
      if (/CACI/i.test(cust)) return 'CACI \u2014 CYBERTRON';
      if (/Techximius/i.test(cust) || /^TECHX-/i.test(inv)) return 'Techximius \u2014 CYBERTRON (SB)';
      if (/^My Energy Game/i.test(cust)) return 'My Energy Game';
      if (/^Bricklayers/i.test(cust)) return 'Bricklayers & Allied CADC';
      if (/^Rowan/i.test(cust)) return 'Rowan-Cabarrus CC';
      return `Other: ${cust}`;
    }

    // Build month list based on CY/FY mode
    const months = getMonthsForMode(mode);
    const MONTH_ABBREVS = months.map((m) => m.mon);

    // Determine the current FY / CY year context
    const now = new Date();
    const currentCalMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentFY = currentCalMonth >= 10 ? currentYear + 1 : currentYear;

    // Build period strings (e.g. "FY25 Oct", "FY26 Jan") for each month.
    // DB convention: "FY<YY> <Mon>" where YY = calendar year of the month,
    // NOT the fiscal year (e.g. Oct 2025 → "FY25 Oct", Jan 2026 → "FY26 Jan").
    const MONTH_NUM: Record<string, number> = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const periodToMonth = new Map<string, string>();
    for (const mon of MONTH_ABBREVS) {
      const calMonthNum = MONTH_NUM[mon];
      let calYear: number;
      if (mode === 'FY') {
        // Oct-Dec belong to the previous calendar year relative to currentFY
        calYear = calMonthNum >= 10 ? currentFY - 1 : currentFY;
      } else {
        // CY mode: all months are in currentYear
        calYear = currentYear;
      }
      const periodStr = `FY${calYear % 100} ${mon}`;
      periodToMonth.set(periodStr, mon);
    }

    // Accumulate amounts: contract → month → amount
    const contractMonths = new Map<string, Map<string, number>>();

    for (const r of rows) {
      const period = r.period as string;
      const mon = periodToMonth.get(period);
      if (!mon) continue; // outside selected CY/FY window

      const contract = classifyContract(r.customer_name as string, r.invoice_number as string | null);
      if (!contractMonths.has(contract)) {
        contractMonths.set(contract, new Map());
      }
      const monthMap = contractMonths.get(contract)!;
      monthMap.set(mon, (monthMap.get(mon) ?? 0) + Number(r.amount));
    }

    // RS3 task order contracts
    const RS3_CONTRACTS = [
      'STEP (F0016)',
      'PEO IEWS SETA (F0028)',
      'C5ISR (F0209)',
      'CECOM (F0038)',
      'FORCE (FA010)',
    ];

    // Desired display order
    const DISPLAY_ORDER = [
      ...RS3_CONTRACTS,
      'Army-other/adjustment',
      'PM Mission Command (GSA)',
      'Sev1Tech \u2014 CP IS&W',
      'Booz Allen \u2014 NEBULA',
      'Nakupuna \u2014 C5ISR CIO',
      'CACI \u2014 CYBERTRON',
      'Techximius \u2014 CYBERTRON (SB)',
      'Bricklayers & Allied CADC',
      'My Energy Game',
      'Rowan-Cabarrus CC',
    ];

    // Collect all contract names, maintaining display order then remainder
    const allContracts = new Set<string>(DISPLAY_ORDER.filter((c) => contractMonths.has(c)));
    for (const c of contractMonths.keys()) {
      allContracts.add(c);
    }

    // Build result rows
    const contractRows: Array<{
      contract: string;
      is_rs3: boolean;
      months: Record<string, number>;
      total: number;
    }> = [];

    let rs3Total = 0;
    const rs3Months: Record<string, number> = {};
    let grandTotal = 0;
    const grandMonths: Record<string, number> = {};

    for (const contract of allContracts) {
      const monthMap = contractMonths.get(contract) ?? new Map();
      const monthData: Record<string, number> = {};
      let rowTotal = 0;

      for (const mon of MONTH_ABBREVS) {
        const amt = monthMap.get(mon) ?? 0;
        monthData[mon] = amt;
        rowTotal += amt;

        grandMonths[mon] = (grandMonths[mon] ?? 0) + amt;
      }

      const isRs3 = RS3_CONTRACTS.includes(contract);
      if (isRs3) {
        rs3Total += rowTotal;
        for (const mon of MONTH_ABBREVS) {
          rs3Months[mon] = (rs3Months[mon] ?? 0) + (monthData[mon] ?? 0);
        }
      }

      grandTotal += rowTotal;
      contractRows.push({ contract, is_rs3: isRs3, months: monthData, total: rowTotal });
    }

    const periodLabel = mode === 'CY'
      ? `CY${currentYear % 100}`
      : `FY${currentFY % 100}`;

    return reply.send(successEnvelope({
      mode,
      period_label: periodLabel,
      month_columns: MONTH_ABBREVS,
      contracts: contractRows,
      rs3_subtotal: { label: 'RS3 IDIQ (W15P7T-19-D-0206)', months: rs3Months, total: rs3Total },
      grand_total: { months: grandMonths, total: grandTotal },
    }, req.requestId));
  });

  // GET /v3/financials/trial-balance
  app.get('/v3/financials/trial-balance', async (req, reply) => {
    noStore(reply);
    const { rows } = await pool.query(
      `SELECT id, period, fiscal_year, quarter, account_code, account_name,
              debit, credit, net_balance, source_doc_id, created_at
       FROM trial_balance
       ORDER BY fiscal_year DESC, quarter DESC, period DESC, account_code`,
    );
    const items = rows.map((r) => ({
      id: Number(r.id),
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: r.quarter != null ? Number(r.quarter) : null,
      account_code: r.account_code as string,
      account_name: r.account_name as string,
      debit: Number(r.debit),
      credit: Number(r.credit),
      net_balance: Number(r.net_balance),
      source_doc_id: r.source_doc_id != null ? Number(r.source_doc_id) : null,
    }));
    return reply.send(successEnvelope({
      items,
      meta: { table: 'trial_balance', row_count: items.length },
    }, req.requestId));
  });

  // GET /v3/financials/project-revenue?period=FY26+May
  // PR-1: Supports optional period filter so tiles reflect a single period,
  // not a blind sum of every month. Returns available_periods for the selector.
  app.get('/v3/financials/project-revenue', async (req, reply) => {
    noStore(reply);
    const qp = req.query as Record<string, string>;
    const periodFilter = qp.period || null;

    // Fetch available periods for the selector dropdown
    const { rows: periodRows } = await pool.query(
      `SELECT DISTINCT period FROM project_revenue_actuals ORDER BY period DESC`,
    );
    const availablePeriods = periodRows.map((r) => r.period as string);

    // Apply period filter if provided; otherwise default to latest period
    const effectivePeriod = periodFilter || availablePeriods[0] || null;

    let rows;
    if (effectivePeriod) {
      ({ rows } = await pool.query(
        `SELECT id, period, fiscal_year, quarter, project_name, contract_number,
                revenue, cost, profit, margin_pct, source_doc_id, created_at
         FROM project_revenue_actuals
         WHERE period = $1
         ORDER BY project_name`,
        [effectivePeriod],
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT id, period, fiscal_year, quarter, project_name, contract_number,
                revenue, cost, profit, margin_pct, source_doc_id, created_at
         FROM project_revenue_actuals
         ORDER BY fiscal_year DESC, quarter DESC, period DESC, project_name`,
      ));
    }

    const items = rows.map((r) => ({
      id: Number(r.id),
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: r.quarter != null ? Number(r.quarter) : null,
      project_name: r.project_name as string,
      contract_number: (r.contract_number as string) ?? null,
      revenue: Number(r.revenue),
      cost: Number(r.cost),
      profit: Number(r.profit),
      margin_pct: r.margin_pct != null ? Number(r.margin_pct) : null,
      source_doc_id: r.source_doc_id != null ? Number(r.source_doc_id) : null,
    }));
    return reply.send(successEnvelope({
      items,
      available_periods: availablePeriods,
      selected_period: effectivePeriod,
      meta: { table: 'project_revenue_actuals', row_count: items.length },
    }, req.requestId));
  });

  // GET /v3/financials/ingestion-coverage
  // For each financial vault doc, show destination table + row count, or an
  // explicit, human-readable reason it did not ingest. Zero-touch requirement
  // (F-1142): NO file may fail silently. Every doc resolves to one of:
  //   ingested | skipped_duplicate | not_ingested (reason) | extraction_failed
  app.get('/v3/financials/ingestion-coverage', async (req, reply) => {
    noStore(reply);
    const { rows: docs } = await pool.query(
      `SELECT id, filename, doc_type, extraction_status, extracted_text, uploaded_at
       FROM vault_documents
       WHERE deleted_at IS NULL
         AND (doc_type = 'financial' OR doc_type = 'other')
       ORDER BY uploaded_at DESC`,
    );

    const tables = [
      'financial_actuals',
      'balance_sheet_actuals',
      'cost_detail_actuals',
      'indirect_expense_actuals',
      'ap_actuals',
      'ar_actuals',
      'trial_balance',
      'project_revenue_actuals',
    ];

    // One grouped query per table (not one per doc) → destinations per doc_id.
    const destinationsByDoc = new Map<number, Array<{ table: string; row_count: number }>>();
    for (const table of tables) {
      const { rows: counts } = await pool.query(
        `SELECT source_doc_id, COUNT(*) AS cnt
         FROM ${table}
         WHERE source_doc_id IS NOT NULL
         GROUP BY source_doc_id`,
      );
      for (const c of counts) {
        const docId = Number(c.source_doc_id);
        const cnt = Number(c.cnt ?? 0);
        if (cnt <= 0) continue;
        const list = destinationsByDoc.get(docId) ?? [];
        list.push({ table, row_count: cnt });
        destinationsByDoc.set(docId, list);
      }
    }

    // Build the per-doc facts the coverage classifier needs. A doc_type='other'
    // file that no financial handler recognizes (e.g. a supplier list) is not a
    // financial-ingestion target at all — it is excluded from the financial
    // coverage report rather than surfaced as a bogus no_handler miss. The
    // content-based classifier still recognizes genuinely financial content
    // regardless of filename, so a real financial doc is never dropped here.
    const docInputs: CoverageDocInput[] = docs.flatMap((doc) => {
      const docId = Number(doc.id);
      const filename = doc.filename as string;
      const destinations = destinationsByDoc.get(docId) ?? [];
      const rowCount = destinations.reduce((s, d) => s + d.row_count, 0);
      const docType = (doc.doc_type as string | null) ?? null;
      const cls = classifyFinancialDoc(
        filename,
        (doc.extracted_text as string | null) ?? '',
        docType,
      );
      const matched = handlerMatched(cls);
      if (docType === 'other' && !matched && rowCount === 0) return [];
      return [{
        doc_id: docId,
        filename,
        extraction_status: doc.extraction_status as string,
        row_count: rowCount,
        primary_type: primaryTypeOf(cls),
        period: inferDocPeriod(filename),
        handler_matched: matched,
      }];
    });

    const verdicts = classifyCoverage(docInputs);

    const coverage = docInputs.map((d) => {
      const verdict = verdicts.get(d.doc_id)!;
      const destinations = destinationsByDoc.get(d.doc_id) ?? [];
      return {
        doc_id: d.doc_id,
        filename: d.filename,
        extraction_status: d.extraction_status,
        destinations,
        row_count: d.row_count,
        status: verdict.status,
        reason: verdict.reason,
        duplicate_of: verdict.duplicate_of,
      };
    });

    return reply.send(successEnvelope({
      coverage,
      summary: {
        total: coverage.length,
        ingested: coverage.filter((c) => c.status === 'ingested').length,
        skipped_duplicate: coverage.filter((c) => c.status === 'skipped_duplicate').length,
        not_ingested: coverage.filter((c) => c.status === 'not_ingested').length,
        extraction_failed: coverage.filter((c) => c.status === 'extraction_failed').length,
        // Back-compat alias: NOT-INGESTED includes the former `no_handler` bucket.
        no_handler: coverage.filter((c) => c.status === 'not_ingested' && c.reason === 'no_handler').length,
      },
    }, req.requestId));
  });

  // ─── Financial Bible v3 endpoints ──────────────────────────────

  // GET /v3/financials/ingestion-status
  app.get('/v3/financials/ingestion-status', async (req, reply) => {
    const { rows: [docCounts] } = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT source_doc_id) FILTER (WHERE source_doc_id IS NOT NULL)
          FROM (
            SELECT source_doc_id FROM balance_sheet_actuals WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM cost_detail_actuals WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM indirect_expense_actuals WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM financial_actuals WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM ap_actuals WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM ar_actuals WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM trial_balance WHERE source_doc_id IS NOT NULL
            UNION
            SELECT source_doc_id FROM project_revenue_actuals WHERE source_doc_id IS NOT NULL
          ) AS all_docs
         ) AS docs_ingested,
         (SELECT COUNT(*) FROM vault_documents
          WHERE deleted_at IS NULL
            AND doc_type IN ('financial', 'other')
         ) AS docs_total`,
    );

    const { rows: [periodRow] } = await pool.query(
      `SELECT period AS max_period
       FROM financial_actuals
       WHERE period NOT LIKE '%Q%'
       ORDER BY fiscal_year DESC, quarter DESC NULLS LAST, period DESC
       LIMIT 1`,
    );

    const { rows: [refreshRow] } = await pool.query(
      `SELECT GREATEST(
         (SELECT MAX(created_at) FROM balance_sheet_actuals),
         (SELECT MAX(created_at) FROM cost_detail_actuals),
         (SELECT MAX(created_at) FROM indirect_expense_actuals),
         (SELECT MAX(created_at) FROM ap_actuals),
         (SELECT MAX(created_at) FROM ar_actuals),
         (SELECT MAX(created_at) FROM trial_balance),
         (SELECT MAX(created_at) FROM project_revenue_actuals),
         (SELECT MAX(vd.uploaded_at) FROM financial_actuals fa
            JOIN vault_documents vd ON vd.id = fa.source_doc_id
          WHERE fa.source_doc_id IS NOT NULL)
       ) AS last_refresh`,
    );

    const { rows: docFiles } = await pool.query(
      `SELECT DISTINCT vd.filename
       FROM vault_documents vd
       WHERE vd.deleted_at IS NULL
         AND vd.id IN (
           SELECT source_doc_id FROM balance_sheet_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM cost_detail_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM indirect_expense_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM financial_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM ap_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM ar_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM trial_balance WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM project_revenue_actuals WHERE source_doc_id IS NOT NULL
         )
       ORDER BY vd.filename`,
    );

    // Parse-warning guard: detect financial_actuals rows where all KPI columns
    // are zero (sales=0, ebit=0) — symptom of a column-mapping failure. Surface
    // them so the user knows a re-ingest may be needed instead of silently
    // showing $0 on the dashboard.
    const { rows: zeroActualDocs } = await pool.query<{ source_doc_id: number; period: string; source: string }>(
      `SELECT fa.source_doc_id, fa.period, fa.source
       FROM financial_actuals fa
       WHERE fa.source_doc_id IS NOT NULL
         AND fa.period NOT LIKE '%Q%'
         AND COALESCE(fa.actual_sales, 0) = 0
         AND COALESCE(fa.actual_ebit, 0) = 0
       ORDER BY fa.fiscal_year DESC, fa.quarter DESC, fa.period DESC`,
    );
    const parse_warnings: string[] = zeroActualDocs.map(
      (r) => `doc_id=${r.source_doc_id}, period=${r.period}, source=${r.source}: actual sales and ebit are both $0 — possible column-mapping failure`,
    );

    return reply.send(successEnvelope({
      docs_ingested: Number(docCounts?.docs_ingested ?? 0),
      docs_total: Number(docCounts?.docs_total ?? 0),
      max_period: (periodRow?.max_period as string) ?? null,
      last_refresh: (refreshRow?.last_refresh as string) ?? null,
      doc_filenames: docFiles.map((d) => d.filename as string),
      parse_warnings,
    }, req.requestId));
  });

  // GET /v3/financials/contract-waterfall?from=YYYY-MM-DD&to=YYYY-MM-DD&parent_vehicle_id=&status=
  // Revenue/profit forecast waterfall: spreads each signed task order's ceiling
  // into monthly projected revenue over its PoP. Includes per-contract margin
  // and a pipeline scaffold layer.
  app.get('/v3/financials/contract-waterfall', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = q.from || null;
    const toDate = q.to || null;
    const parentVehicleId = q.parent_vehicle_id ? Number(q.parent_vehicle_id) : null;
    const statusFilter = q.status || null;
    const primeOrSub = q.prime_or_sub || null;

    let whereClause = 'WHERE t.is_seed = FALSE';
    const params: (string | number)[] = [];
    let paramIdx = 0;

    if (fromDate) {
      paramIdx++;
      whereClause += ` AND (t.pop_end >= $${paramIdx} OR t.pop_end IS NULL)`;
      params.push(fromDate);
    }
    if (toDate) {
      paramIdx++;
      whereClause += ` AND (t.pop_start <= $${paramIdx} OR t.pop_start IS NULL)`;
      params.push(toDate);
    }
    if (parentVehicleId) {
      paramIdx++;
      whereClause += ` AND t.parent_vehicle_id = $${paramIdx}`;
      params.push(parentVehicleId);
    }
    if (statusFilter) {
      paramIdx++;
      whereClause += ` AND t.status = $${paramIdx}`;
      params.push(statusFilter);
    }
    if (primeOrSub) {
      paramIdx++;
      whereClause += ` AND t.prime_or_sub = $${paramIdx}`;
      params.push(primeOrSub);
    }

    // 1. Fetch signed task orders
    const { rows } = await pool.query(
      `SELECT t.id, t.to_name, t.to_number,
              t.parent_vehicle_id, t.parent_vehicle_short_name,
              t.prime_or_sub, t.pop_start, t.pop_end,
              t.total_ceiling, t.funded_to_date, t.status,
              cv.short_name AS cv_short_name
       FROM task_orders t
       LEFT JOIN contract_vehicles cv ON cv.id = t.parent_vehicle_id
       ${whereClause}
       ORDER BY t.parent_vehicle_short_name NULLS LAST, t.to_name`,
      params,
    );

    // 1b. Fetch per-contract-year breakdowns (task_order_years)
    const taskOrderIds = rows.map((r) => Number(r.id));
    const yearsByTaskOrder = new Map<number, { period_start: Date; period_end: Date; ceiling: number; months_in_period: number }[]>();
    if (taskOrderIds.length > 0) {
      const { rows: yearRows } = await pool.query(
        `SELECT task_order_id, period_start, period_end, ceiling, months_in_period
         FROM task_order_years
         WHERE task_order_id = ANY($1)
         ORDER BY task_order_id, period_start`,
        [taskOrderIds],
      );
      for (const yr of yearRows) {
        const toId = Number(yr.task_order_id);
        if (!yearsByTaskOrder.has(toId)) yearsByTaskOrder.set(toId, []);
        yearsByTaskOrder.get(toId)!.push({
          period_start: new Date(yr.period_start as string),
          period_end: new Date(yr.period_end as string),
          ceiling: Number(yr.ceiling),
          months_in_period: Number(yr.months_in_period),
        });
      }
    }

    // 2. Fetch per-contract margins from project_revenue_actuals
    const { rows: marginRows } = await pool.query(
      `SELECT contract_number,
              COALESCE(AVG(margin_pct), 0) AS avg_margin_pct,
              SUM(revenue) AS total_revenue,
              SUM(cost) AS total_cost
       FROM project_revenue_actuals
       WHERE contract_number IS NOT NULL
       GROUP BY contract_number`,
    );
    const marginByContract = new Map<string, number>();
    let portfolioTotalRev = 0;
    let portfolioTotalCost = 0;
    for (const m of marginRows) {
      const pct = Number(m.avg_margin_pct);
      if (m.contract_number) marginByContract.set(m.contract_number as string, pct);
      portfolioTotalRev += Number(m.total_revenue || 0);
      portfolioTotalCost += Number(m.total_cost || 0);
    }
    const portfolioAvgMargin = portfolioTotalRev > 0
      ? ((portfolioTotalRev - portfolioTotalCost) / portfolioTotalRev) * 100
      : 15; // default 15% if no data

    // 3. Build contract forecasts
    const contracts: {
      id: number;
      to_name: string;
      to_number: string;
      parent_vehicle_short_name: string | null;
      ceiling: number;
      funded_to_date: number;
      pop_start: string;
      pop_end: string;
      annual_revenue: number;
      monthly_revenue: number;
      margin_pct: number;
      margin_source: 'actual' | 'portfolio_average';
      status: string;
    }[] = [];

    // Map of month -> { contract_id -> { funded_revenue, unfunded_revenue, profit } }
    const monthlyMap = new Map<string, Map<number, { funded_revenue: number; unfunded_revenue: number; profit: number }>>();

    for (const r of rows) {
      const id = Number(r.id);
      const toName = r.to_name as string;
      const toNumber = r.to_number as string;
      const parentShort = (r.parent_vehicle_short_name as string | null) ?? (r.cv_short_name as string | null);
      const ceiling = r.total_ceiling !== null ? Number(r.total_ceiling) : 0;
      const fundedToDate = r.funded_to_date !== null ? Number(r.funded_to_date) : 0;
      const popStart = r.pop_start ? (r.pop_start as string) : null;
      const popEnd = r.pop_end ? (r.pop_end as string) : null;

      if (!popStart || !popEnd || ceiling <= 0) continue;

      // Per-contract-year spread: use task_order_years when available,
      // otherwise generate synthetic Jul 1 – Jun 30 contract years from
      // the PoP and spread ceiling proportionally. Months outside any
      // contract year get $0 revenue.
      const start = new Date(popStart);
      const end = new Date(popEnd);

      // Use UTC to avoid timezone-shift issues with date-only ISO strings
      const startYear = start.getUTCFullYear();
      const startMonth = start.getUTCMonth(); // 0-based
      const endYear = end.getUTCFullYear();
      const endMonth_ = end.getUTCMonth();
      const totalPopMonths = (endYear - startYear) * 12 + (endMonth_ - startMonth) + 1;

      let contractYears = yearsByTaskOrder.get(id);

      // Guard: if DB-sourced years exist but their ceiling sum covers less
      // than 95% of total_ceiling, treat them as incomplete and fall back to
      // synthetic generation to avoid silently zeroing revenue.
      if (contractYears && contractYears.length > 0) {
        const yearsCeilingSum = contractYears.reduce((s, cy) => s + cy.ceiling, 0);
        if (yearsCeilingSum < ceiling * 0.95) {
          contractYears = undefined;
        }
      }

      // If no explicit yearly breakdown exists (or incomplete), generate
      // synthetic contract years using Jul 1 – Jun 30 boundaries with
      // proportional ceiling.
      if (!contractYears || contractYears.length === 0) {
        contractYears = [];
        // Walk PoP in Jul–Jun year segments
        let segStart = new Date(Date.UTC(startYear, startMonth, 1));
        while (segStart <= end) {
          const segStartM = segStart.getUTCMonth();
          const segStartY = segStart.getUTCFullYear();
          let nextJul1: Date;
          if (segStartM < 6) {
            nextJul1 = new Date(Date.UTC(segStartY, 6, 1));
          } else {
            nextJul1 = new Date(Date.UTC(segStartY + 1, 6, 1));
          }
          // Segment end: last month before next Jul 1, capped at PoP end
          const segEndDate = new Date(Math.min(nextJul1.getTime() - 1, end.getTime()));
          const segEndFirst = new Date(Date.UTC(segEndDate.getUTCFullYear(), segEndDate.getUTCMonth(), 1));
          const months = (segEndFirst.getUTCFullYear() - segStart.getUTCFullYear()) * 12
            + (segEndFirst.getUTCMonth() - segStart.getUTCMonth()) + 1;
          const yearCeiling = totalPopMonths > 0 ? ceiling * (months / totalPopMonths) : 0;
          contractYears.push({
            period_start: new Date(segStart),
            period_end: segEndFirst,
            ceiling: yearCeiling,
            months_in_period: months,
          });
          segStart = nextJul1;
        }
      }

      // Helper: for a given month (first-of-month Date), return monthly revenue
      // from the matching contract year. Returns 0 for months outside all years.
      function monthlyRevenueForDate(monthStart: Date): number {
        const ym = monthStart.getUTCFullYear() * 100 + monthStart.getUTCMonth();
        for (const cy of contractYears!) {
          const cyStart = cy.period_start.getUTCFullYear() * 100 + cy.period_start.getUTCMonth();
          const cyEnd = cy.period_end.getUTCFullYear() * 100 + cy.period_end.getUTCMonth();
          if (ym >= cyStart && ym <= cyEnd) {
            return cy.ceiling / cy.months_in_period;
          }
        }
        return 0;
      }

      // Per-contract margin lookup
      let marginPct = marginByContract.get(toNumber) ?? null;
      const marginSource: 'actual' | 'portfolio_average' = marginPct !== null ? 'actual' : 'portfolio_average';
      if (marginPct === null) marginPct = portfolioAvgMargin;

      // Compute a representative annual/monthly for the contract summary
      // (uses first contract year rate)
      const summaryMonthly = contractYears.length > 0
        ? contractYears[0].ceiling / contractYears[0].months_in_period
        : 0;
      const summaryAnnual = summaryMonthly * 12;

      contracts.push({
        id,
        to_name: toName,
        to_number: toNumber,
        parent_vehicle_short_name: parentShort,
        ceiling,
        funded_to_date: fundedToDate,
        pop_start: popStart,
        pop_end: popEnd,
        annual_revenue: summaryAnnual,
        monthly_revenue: summaryMonthly,
        margin_pct: Math.round(marginPct * 100) / 100,
        margin_source: marginSource,
        status: r.status as string,
      });

      // Generate monthly buckets from pop_start to pop_end (UTC)
      let cumulativeRevenue = 0;

      const cur = new Date(Date.UTC(startYear, startMonth, 1));
      const endMonthDate = new Date(Date.UTC(endYear, endMonth_, 1));

      while (cur <= endMonthDate) {
        const monthKey = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`;
        const monthRev = monthlyRevenueForDate(cur);
        cumulativeRevenue += monthRev;

        // Determine funded vs unfunded based on cumulative recognition vs funded_to_date
        let fundedRev: number;
        let unfundedRev: number;
        if (cumulativeRevenue <= fundedToDate) {
          fundedRev = monthRev;
          unfundedRev = 0;
        } else if (cumulativeRevenue - monthRev >= fundedToDate) {
          fundedRev = 0;
          unfundedRev = monthRev;
        } else {
          fundedRev = fundedToDate - (cumulativeRevenue - monthRev);
          unfundedRev = monthRev - fundedRev;
        }

        const profit = monthRev * (marginPct / 100);

        if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, new Map());
        const contractMap = monthlyMap.get(monthKey)!;
        contractMap.set(id, { funded_revenue: fundedRev, unfunded_revenue: unfundedRev, profit });

        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }

    // 4. Build sorted time series
    const allMonths = Array.from(monthlyMap.keys()).sort();
    const forecast = allMonths.map((month) => {
      const contractMap = monthlyMap.get(month)!;
      let totalRevenue = 0;
      let totalProfit = 0;
      let totalFunded = 0;
      let totalUnfunded = 0;
      const byContract: { contract_id: number; funded_revenue: number; unfunded_revenue: number; profit: number }[] = [];

      for (const [contractId, data] of contractMap) {
        totalRevenue += data.funded_revenue + data.unfunded_revenue;
        totalProfit += data.profit;
        totalFunded += data.funded_revenue;
        totalUnfunded += data.unfunded_revenue;
        byContract.push({
          contract_id: contractId,
          funded_revenue: Math.round(data.funded_revenue * 100) / 100,
          unfunded_revenue: Math.round(data.unfunded_revenue * 100) / 100,
          profit: Math.round(data.profit * 100) / 100,
        });
      }

      return {
        month,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_profit: Math.round(totalProfit * 100) / 100,
        total_funded: Math.round(totalFunded * 100) / 100,
        total_unfunded: Math.round(totalUnfunded * 100) / 100,
        by_contract: byContract,
      };
    });

    // 5. Fetch available parent vehicles for filters
    const { rows: vehicleRows } = await pool.query(
      `SELECT DISTINCT cv.id, cv.short_name
       FROM contract_vehicles cv
       INNER JOIN task_orders t ON t.parent_vehicle_id = cv.id
       WHERE t.is_seed = FALSE
       ORDER BY cv.short_name`,
    );

    return reply.send(successEnvelope({
      contracts,
      forecast,
      pipeline: [], // CW-3: scaffold — empty until pipeline data source is wired
      spread_method: 'per_year_ceiling',
      portfolio_avg_margin: Math.round(portfolioAvgMargin * 100) / 100,
      today,
      available_vehicles: vehicleRows.map((v) => ({ id: Number(v.id), short_name: v.short_name as string })),
      meta: {
        sources: [
          { table: 'task_orders', row_count: contracts.length },
          { table: 'project_revenue_actuals', row_count: marginRows.length },
        ],
        last_refresh: new Date().toISOString(),
        period: null,
      },
    }, req.requestId));
  });

  // GET /v3/financials/aop-execution?fy=FY26
  app.get('/v3/financials/aop-execution', async (req, reply) => {
    noStore(reply);
    const fy = (req.query as Record<string, string>).fy ?? 'FY26';
    const mode: CalendarMode = parseCalendarMode(fy);
    const fiscalYear = normalizeFiscalYear(fy);
    const orderedMonths = getMonthsForMode(mode);

    // Aggregate after applying the per-period income_statement-first source
    // preference so each period's cost lines come from a single source.
    const { rows } = await pool.query(
      `WITH ranked AS (
         SELECT period, cost_element, pool, target_amount, actual_amount, variance_amount,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM cost_detail_actuals
         WHERE fiscal_year = $1
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period),
       preferred AS (
         SELECT r.* FROM ranked r
         JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       )
       SELECT period, cost_element, pool,
              SUM(target_amount) AS planned,
              SUM(actual_amount) AS actual,
              SUM(variance_amount) AS variance
       FROM preferred
       GROUP BY period, cost_element, pool
       ORDER BY cost_element, pool, period`,
      [fiscalYear],
    );

    const items = rows.map((r) => ({
      period: r.period as string,
      cost_element: r.cost_element as string,
      pool: r.pool as string,
      planned: Number(r.planned),
      actual: Number(r.actual),
      variance: Number(r.variance),
    }));

    const { rows: periodRows } = await pool.query(
      `SELECT DISTINCT period FROM cost_detail_actuals WHERE fiscal_year = $1 ORDER BY period`,
      [fiscalYear],
    );

    const { rows: srcDocs } = await pool.query(
      `SELECT DISTINCT vd.id AS vault_doc_id, vd.filename, vd.uploaded_at AS ingested_at
       FROM cost_detail_actuals cd
       JOIN vault_documents vd ON vd.id = cd.source_doc_id
       WHERE cd.fiscal_year = $1 AND cd.source_doc_id IS NOT NULL`,
      [fiscalYear],
    );

    // Build the full 12-month plan-vs-actual axis using mode-aware month order.
    // Two separate queries (plan + actuals), then join in JS so every month is
    // always represented — even months with no actuals yet.
    const fyShort = `FY${fiscalYear % 100}`;

    // Plan: the annual operating plan (user_aop) is the AOP-execution baseline
    // and covers all 12 months. BUG 5: l1_target is the company-P&L TARGET
    // series and now lives exclusively in financial_actuals (feeding the
    // trend/variance path); it is no longer read here. DISTINCT ON keeps one row
    // per period defensively.
    const { rows: planRows } = await pool.query(
      `SELECT DISTINCT ON (period)
              period, source, plan_orders, plan_sales, plan_ebit,
              plan_gross_margin, plan_ros
       FROM financial_plan
       WHERE is_seed = false
         AND source = 'user_aop'
         AND fiscal_year = $1 AND period NOT LIKE '%Q%'
       ORDER BY period`,
      [fiscalYear],
    );

    const hasPlan = planRows.length > 0;
    const planByPeriod = new Map<string, (typeof planRows)[0]>();
    for (const r of planRows) planByPeriod.set(r.period as string, r);

    // Actuals: source precedence income_statement > l1_actual. DISTINCT ON
    // ensures one canonical row per period — income_statement (monthly P&L)
    // is preferred; l1_actual (project ledger) fills gaps where no P&L exists.
    const { rows: actualRows } = await pool.query(
      `SELECT DISTINCT ON (period)
              period, source, actual_orders, actual_sales, actual_ebit,
              actual_gross_margin, actual_ros
       FROM financial_actuals
       WHERE is_seed = false
         AND source IN ('income_statement', 'l1_actual')
         AND fiscal_year = $1 AND period NOT LIKE '%Q%'
       ORDER BY period,
                CASE source WHEN 'income_statement' THEN 0 WHEN 'l1_actual' THEN 1 ELSE 2 END`,
      [fiscalYear],
    );

    const actualByPeriod = new Map<string, (typeof actualRows)[0]>();
    for (const r of actualRows) {
      // IS#3: Normalize gross-margin units — l1_actual stores fractions,
      // income_statement stores percentages. Convert fractions → percentage.
      if (r.source === 'l1_actual' && r.actual_gross_margin != null) {
        const gm = Number(r.actual_gross_margin);
        if (Math.abs(gm) <= 1.5) r.actual_gross_margin = String(gm * 100);
      }
      actualByPeriod.set(r.period as string, r);
    }

    // Determine the winning plan source for the response metadata.
    const planSource: string | null = hasPlan
      ? (planRows[0].source as string)
      : null;

    // Always 12 rows in the mode's month order (FY: Oct–Sep, CY: Jan–Dec).
    const planActualRows = orderedMonths.map(({ mon }) => {
      const period = `${fyShort} ${mon}`;
      const plan = planByPeriod.get(period);
      const actual = actualByPeriod.get(period);
      return {
        period,
        plan_source: plan ? (plan.source as string) : null,
        actual_source: actual ? (actual.source as string) : null,
        plan_orders: plan?.plan_orders ?? null,
        actual_orders: actual?.actual_orders ?? null,
        plan_sales: plan?.plan_sales ?? null,
        actual_sales: actual?.actual_sales ?? null,
        plan_ebit: plan?.plan_ebit ?? null,
        actual_ebit: actual?.actual_ebit ?? null,
        plan_gross_margin: plan?.plan_gross_margin ?? null,
        actual_gross_margin: actual?.actual_gross_margin ?? null,
        plan_ros: plan?.plan_ros ?? null,
        actual_ros: actual?.actual_ros ?? null,
      };
    });

    // Build one Plan/Actual/Variance metric block per line.
    // kind: 'currency' lines roll up by sum; 'percent' lines roll up by average.
    const metricDefs: Array<{
      key: string;
      label: string;
      kind: 'currency' | 'percent';
      favorable: 'higher' | 'lower';
      planCol: string;
      actualCol: string;
    }> = [
      { key: 'orders', label: 'Orders', kind: 'currency', favorable: 'higher', planCol: 'plan_orders', actualCol: 'actual_orders' },
      { key: 'sales', label: 'Sales', kind: 'currency', favorable: 'higher', planCol: 'plan_sales', actualCol: 'actual_sales' },
      { key: 'ebit', label: 'EBIT', kind: 'currency', favorable: 'higher', planCol: 'plan_ebit', actualCol: 'actual_ebit' },
      { key: 'gross_margin', label: 'Gross Margin %', kind: 'percent', favorable: 'higher', planCol: 'plan_gross_margin', actualCol: 'actual_gross_margin' },
      { key: 'ros', label: 'ROS %', kind: 'percent', favorable: 'higher', planCol: 'plan_ros', actualCol: 'actual_ros' },
    ];

    const metrics = metricDefs.map((def) => {
      const months = planActualRows.map((r) => {
        const row = r as Record<string, unknown>;
        const planRaw = row[def.planCol];
        const actualRaw = row[def.actualCol];
        const plan = planRaw !== null && planRaw !== undefined ? Number(planRaw) : null;
        const actual = actualRaw !== null && actualRaw !== undefined ? Number(actualRaw) : null;
        return {
          period: r.period as string,
          plan,
          actual,
          variance: actual !== null && plan !== null ? actual - plan : null,
        };
      });
      const monthsWithPlan = months.filter((m) => m.plan !== null);
      const monthsWithActual = months.filter((m) => m.actual !== null);
      let planTotal: number | null;
      let actualTotal: number | null;
      if (def.kind === 'percent') {
        planTotal = monthsWithPlan.length
          ? monthsWithPlan.reduce((s, m) => s + (m.plan ?? 0), 0) / monthsWithPlan.length
          : null;
        actualTotal = monthsWithActual.length
          ? monthsWithActual.reduce((s, m) => s + (m.actual ?? 0), 0) / monthsWithActual.length
          : null;
      } else {
        planTotal = monthsWithPlan.length
          ? monthsWithPlan.reduce((s, m) => s + (m.plan ?? 0), 0)
          : null;
        actualTotal = monthsWithActual.length
          ? monthsWithActual.reduce((s, m) => s + (m.actual ?? 0), 0)
          : null;
      }
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        favorable: def.favorable,
        months,
        plan_total: planTotal,
        actual_total: actualTotal,
        variance_total: actualTotal !== null && planTotal !== null ? actualTotal - planTotal : null,
      };
    });

    // Keep `revenue` for backward-compatibility (the Sales block).
    const revenue = metrics.find((m) => m.key === 'sales') ?? null;

    return reply.send(successEnvelope({
      items,
      metrics,
      revenue,
      has_plan: hasPlan,
      plan_source: planSource,
      calendar_mode: mode,
      periods: periodRows.map((r) => r.period as string),
      meta: {
        sources: srcDocs.map((d) => ({
          vault_doc_id: Number(d.vault_doc_id),
          filename: d.filename as string,
          ingested_at: d.ingested_at as string,
          parser: 'cost_detail_extract',
        })),
        last_refresh: srcDocs.length > 0
          ? srcDocs.reduce((max, d) => {
              const t = new Date(d.ingested_at as string).getTime();
              return t > max ? t : max;
            }, 0)
          : null,
        period: `FY${fiscalYear % 100}`,
      },
    }, req.requestId));
  });

  // ─── AOP Plan input (user-entered annual plan + flat 1/12 division) ──────
  //
  // The owner enters ONE annual number per metric for a fiscal year. We then do
  // arithmetic on the owner's own numbers (NOT seeded/benchmark data):
  //   • dollar targets (orders, sales, EBIT) are divided FLAT — annual / 12 per month
  //   • percentages (gross_margin, ros) are applied UNCHANGED to every month
  // and write 12 monthly rows (source='user_aop', is_seed=false) into financial_plan.

  // All 12 calendar months (used for plan writes — always writes all 12 months
  // with the mode-appropriate quarter assignment).
  const ALL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  // GET /v3/financials/aop-plan?fy=FY26
  // Returns the owner's annual AOP plan for a fiscal year (reconstructed from the
  // stored monthly rows), or nulls when none has been entered yet.
  app.get('/v3/financials/aop-plan', async (req, reply) => {
    noStore(reply);
    const fy = (req.query as Record<string, string>).fy ?? 'FY26';
    const fiscalYear = normalizeFiscalYear(fy);

    const { rows } = await pool.query(
      `SELECT
         SUM(plan_orders) AS plan_orders,
         SUM(plan_sales)  AS plan_sales,
         SUM(plan_ebit)   AS plan_ebit,
         AVG(plan_gross_margin) AS plan_gross_margin,
         AVG(plan_ros)    AS plan_ros,
         COUNT(*) AS month_count
       FROM financial_plan
       WHERE source = 'user_aop' AND is_seed = false
         AND fiscal_year = $1 AND period NOT LIKE '%Q%'`,
      [fiscalYear],
    );

    const r = rows[0];
    const hasPlan = r && Number(r.month_count) > 0;

    return reply.send(successEnvelope({
      fiscal_year: fiscalYear,
      fy: `FY${fiscalYear % 100}`,
      has_plan: Boolean(hasPlan),
      plan: hasPlan
        ? {
            plan_orders: Number(r.plan_orders),
            plan_sales: Number(r.plan_sales),
            plan_ebit: Number(r.plan_ebit),
            plan_gross_margin: Number(r.plan_gross_margin),
            plan_ros: Number(r.plan_ros),
          }
        : null,
    }, req.requestId));
  });

  // POST /v3/financials/aop-plan
  // Body: { fy: 'FY26', plan_orders, plan_sales, plan_ebit, plan_gross_margin, plan_ros }
  // Saves the owner's annual plan: deletes ALL existing financial_plan rows for the
  // FY (old aop_seed AND any prior user_aop) and inserts 12 fresh monthly rows, all
  // in one transaction. Dollars are flat 1/12; percentages are repeated per month.
  app.post('/v3/financials/aop-plan', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const fyRaw = typeof body.fy === 'string' ? body.fy : '';
    const fiscalYear = normalizeFiscalYear(fyRaw, 0);
    if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'A valid fiscal year (e.g. "FY2026" or "FY26") is required', req.requestId));
    }

    // Each metric must be a finite number. Percentages must be 0..100.
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v)
        ? v
        : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
          ? Number(v)
          : null;

    const planOrders = num(body.plan_orders);
    const planSales = num(body.plan_sales);
    const planEbit = num(body.plan_ebit);
    const planGm = num(body.plan_gross_margin);
    const planRos = num(body.plan_ros);

    const missing: string[] = [];
    if (planOrders === null) missing.push('plan_orders');
    if (planSales === null) missing.push('plan_sales');
    if (planEbit === null) missing.push('plan_ebit');
    if (planGm === null) missing.push('plan_gross_margin');
    if (planRos === null) missing.push('plan_ros');
    if (missing.length > 0) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `Missing or invalid numeric value(s): ${missing.join(', ')}`, req.requestId));
    }
    if ((planGm as number) < 0 || (planGm as number) > 100 || (planRos as number) < 0 || (planRos as number) > 100) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Percentages (gross margin, ROS) must be between 0 and 100', req.requestId));
    }

    const fyShort = `FY${fiscalYear % 100}`;
    // Flat 1/12 split of the annual dollar targets; percentages carry through.
    const monthOrders = (planOrders as number) / 12;
    const monthSales = (planSales as number) / 12;
    const monthEbit = (planEbit as number) / 12;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Replace this FY's plan: drop old seed AND prior user_aop month/quarter rows.
      await client.query(
        `DELETE FROM financial_plan
          WHERE fiscal_year = $1 AND source IN ('aop_seed', 'user_aop')`,
        [fiscalYear],
      );

      // Write all 12 months with CY quarters (ceil(month/3)) to stay
      // consistent with financial_actuals ingestion convention.
      const CY_PLAN_MONTHS = getMonthsForMode('CY');
      for (const { mon, quarter } of CY_PLAN_MONTHS) {
        await client.query(
          `INSERT INTO financial_plan
             (period, fiscal_year, quarter, plan_orders, plan_sales, plan_ebit,
              plan_gross_margin, plan_ros, is_seed, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, 'user_aop')`,
          [`${fyShort} ${mon}`, fiscalYear, quarter, monthOrders, monthSales, monthEbit, planGm, planRos],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      req.log.error({ err }, 'aop-plan save failed');
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'Failed to save AOP plan', req.requestId));
    } finally {
      client.release();
    }

    recordAuditLog(pool, {
      action: 'financial_plan_upsert',
      table_name: 'financial_plan',
      record_ref: `fy:${fiscalYear}`,
      old_values: null,
      new_values: { fiscal_year: fiscalYear, plan_orders: planOrders, plan_sales: planSales, plan_ebit: planEbit, plan_gross_margin: planGm, plan_ros: planRos },
      actor: 'user',
      source: 'user',
    }).catch(() => { /* best-effort */ });

    return reply.send(successEnvelope({
      fiscal_year: fiscalYear,
      fy: fyShort,
      months_written: ALL_MONTHS.length,
      plan: {
        plan_orders: planOrders,
        plan_sales: planSales,
        plan_ebit: planEbit,
        plan_gross_margin: planGm,
        plan_ros: planRos,
      },
      monthly: {
        plan_orders: monthOrders,
        plan_sales: monthSales,
        plan_ebit: monthEbit,
        plan_gross_margin: planGm,
        plan_ros: planRos,
      },
    }, req.requestId));
  });

  // POST /v3/financials/aop-plan/clear-seed
  // One-shot cleanup of the fake assistant-seeded rows (source='aop_seed') that
  // were never owner-approved. Optional body { fy: 'FY26' } limits it to one FY;
  // omit to clear all fiscal years. Never touches user_aop or other real rows.
  app.post('/v3/financials/aop-plan/clear-seed', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fyRaw = typeof body.fy === 'string' ? body.fy : '';
    const fiscalYear = fyRaw ? normalizeFiscalYear(fyRaw, 0) || null : null;

    const params: number[] = [];
    let where = "source = 'aop_seed'";
    if (fiscalYear && !Number.isNaN(fiscalYear)) {
      params.push(fiscalYear);
      where += ` AND fiscal_year = $${params.length}`;
    }

    const { rowCount } = await pool.query(
      `DELETE FROM financial_plan WHERE ${where}`,
      params,
    );

    recordAuditLog(pool, {
      action: 'financial_plan_delete',
      table_name: 'financial_plan',
      record_ref: fiscalYear ? `fy:${fiscalYear}` : 'all_seed',
      old_values: { cleared: rowCount ?? 0, fiscal_year: fiscalYear },
      new_values: null,
      actor: 'user',
      source: 'user',
    }).catch(() => { /* best-effort */ });

    return reply.send(successEnvelope({
      cleared: rowCount ?? 0,
      fiscal_year: fiscalYear,
    }, req.requestId));
  });

  // GET /v3/financials/aop-capture?fy=FY26
  app.get('/v3/financials/aop-capture', async (req, reply) => {
    noStore(reply);
    const captureStages = ['interest', 'qualified', 'pursue', 'solicitation', 'post_submittal'];

    const { rows } = await pool.query(
      `SELECT pi.id, pi.stage, pi.estimated_value, pi.win_probability,
              pi.capture_owner, pi.milestone_90day, pi.created_at,
              o.title, o.agency, o.solicitation_number, o.response_due_at
       FROM pipeline_items pi
       JOIN opportunities o ON o.id = pi.opportunity_id
       WHERE pi.stage = ANY($1)
       ORDER BY pi.stage, pi.estimated_value DESC NULLS LAST`,
      [captureStages],
    );

    const items = rows.map((r) => ({
      id: Number(r.id),
      title: r.title as string,
      agency: r.agency as string | null,
      stage: r.stage as string,
      value: r.estimated_value !== null ? Number(r.estimated_value) : null,
      pwin: r.win_probability !== null ? Number(r.win_probability) : null,
      capture_owner: r.capture_owner as string,
      milestone_90day: r.milestone_90day as string | null,
      solicitation_number: r.solicitation_number as string | null,
      response_due_at: r.response_due_at as string | null,
    }));

    return reply.send(successEnvelope({
      items,
      meta: {
        sources: [{ table: 'pipeline_items', stages: captureStages, row_count: items.length }],
        last_refresh: new Date().toISOString(),
        period: null,
      },
    }, req.requestId));
  });

  // GET /v3/financials/p2?period=MAR-26
  app.get('/v3/financials/p2', async (req, reply) => {
    noStore(reply);
    // KPI tiles from financial_actuals (latest quarter)
    const { rows: kpiRows } = await pool.query(
      `SELECT period, fiscal_year, quarter,
              actual_orders, actual_sales, actual_ebit,
              actual_gross_margin, actual_ros
       FROM financial_actuals
       WHERE source = 'income_statement' AND period LIKE '%Q%'
       ORDER BY fiscal_year DESC, quarter DESC
       LIMIT 1`,
    );

    // Monthly actuals — income_statement source only for the Income Statement
    // section. l1_actual rows are a separate project-revenue ledger and must not
    // appear as bare "l1_actual" labels in the CEO view.
    const { rows: monthlyRows } = await pool.query(
      `SELECT period, fiscal_year, quarter, source,
              actual_orders, actual_sales, actual_ebit,
              actual_gross_margin, actual_ros
       FROM financial_actuals
       WHERE source = 'income_statement' AND period NOT LIKE '%Q%'
       ORDER BY fiscal_year, quarter, period`,
    );

    // Quarter-total rows for the income statement (for YTD rollup)
    const { rows: quarterRows } = await pool.query(
      `SELECT period, fiscal_year, quarter,
              actual_orders, actual_sales, actual_ebit,
              actual_gross_margin, actual_ros
       FROM financial_actuals
       WHERE source = 'income_statement' AND period LIKE '%Q%'
       ORDER BY fiscal_year, quarter`,
    );

    // Plan data
    const { rows: planRows } = await pool.query(
      `SELECT period, fiscal_year, quarter, source,
              plan_orders, plan_sales, plan_ebit,
              plan_gross_margin, plan_ros
       FROM financial_plan
       WHERE period LIKE '%Q%'
       ORDER BY fiscal_year DESC, quarter DESC
       LIMIT 1`,
    );

    // Cost detail aggregated by pool (contract P&L proxy). Per-period
    // income_statement-first source preference applied before the pool rollup.
    const { rows: costByPool } = await pool.query(
      `WITH ranked AS (
         SELECT period, pool, target_amount, actual_amount, variance_amount,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM cost_detail_actuals
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period),
       preferred AS (
         SELECT r.* FROM ranked r
         JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       )
       SELECT pool,
              SUM(target_amount) AS total_target,
              SUM(actual_amount) AS total_actual,
              SUM(variance_amount) AS total_variance
       FROM preferred
       GROUP BY pool
       ORDER BY SUM(actual_amount) DESC`,
    );

    // Direct cost breakdown by period and cost element (for income statement
    // detail). Uses pool='DIRECT' to get the pure direct-cost component per
    // element. Aggregated cost elements are mapped to proper labels in the
    // frontend; only the DIRECT pool is used here.
    const { rows: directCostRows } = await pool.query(
      `WITH ranked AS (
         SELECT period, cost_element, actual_amount, LOWER(pool) AS lpool,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM cost_detail_actuals
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period),
       preferred AS (
         SELECT r.* FROM ranked r
         JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       )
       SELECT period, cost_element,
              SUM(actual_amount) AS amount
       FROM preferred
       WHERE lpool = 'direct'
       GROUP BY period, cost_element
       ORDER BY period, cost_element`,
    );

    // Indirect expense breakdown by period and pool (Fringe, Overhead, G&A).
    // Per-period income_statement-first source preference applied before rollup.
    const { rows: indirectRows } = await pool.query(
      `WITH ranked AS (
         SELECT period, pool, current_period_actual,
                CASE WHEN source = 'income_statement' THEN 1 ELSE 2 END AS src_rank
         FROM indirect_expense_actuals
       ),
       best AS (SELECT period, MIN(src_rank) AS best_rank FROM ranked GROUP BY period),
       preferred AS (
         SELECT r.* FROM ranked r
         JOIN best b ON r.period = b.period AND r.src_rank = b.best_rank
       )
       SELECT period, pool,
              SUM(current_period_actual) AS amount
       FROM preferred
       GROUP BY period, pool
       ORDER BY period, pool`,
    );

    // Source documents
    const { rows: srcDocs } = await pool.query(
      `SELECT DISTINCT vd.id AS vault_doc_id, vd.filename, vd.uploaded_at AS ingested_at
       FROM vault_documents vd
       WHERE vd.deleted_at IS NULL
         AND vd.id IN (
           SELECT source_doc_id FROM cost_detail_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM balance_sheet_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM financial_actuals WHERE source_doc_id IS NOT NULL
           UNION
           SELECT source_doc_id FROM indirect_expense_actuals WHERE source_doc_id IS NOT NULL
         )
       ORDER BY vd.filename`,
    );

    const kpi = kpiRows[0];
    const plan = planRows[0];

    const kpiData = kpi ? {
      ytd_revenue: Number(kpi.actual_sales),
      ytd_expenses: Number(kpi.actual_sales) - Number(kpi.actual_ebit),
      ytd_profit: Number(kpi.actual_ebit),
      ytd_margin: Number(kpi.actual_gross_margin),
      period: kpi.period as string,
    } : null;

    const planData = plan ? {
      plan_sales: Number(plan.plan_sales),
      plan_ebit: Number(plan.plan_ebit),
      plan_gross_margin: Number(plan.plan_gross_margin),
    } : null;

    // Build full income statement line items per period from the stored metrics.
    // Derived line items (Direct Costs, Gross Profit, Operating Expenses) are
    // computed from Revenue (= sales) and the stored gross_margin% / EBIT so
    // every number traces back to the real ingested data.
    function buildStatementItems(r: {
      actual_orders: unknown;
      actual_sales: unknown;
      actual_ebit: unknown;
      actual_gross_margin: unknown;
      actual_ros: unknown;
      period: unknown;
    }) {
      const revenue = Number(r.actual_sales);
      const gm = Number(r.actual_gross_margin);
      const ebit = Number(r.actual_ebit);
      const orders = Number(r.actual_orders);
      const ros = Number(r.actual_ros);
      const grossProfit = revenue * (gm / 100);
      const directCosts = revenue - grossProfit;
      const opExpenses = grossProfit - ebit;
      return {
        period: r.period as string,
        revenue,
        direct_costs: directCosts,
        gross_profit: grossProfit,
        gross_margin_pct: gm,
        operating_expenses: opExpenses,
        ebit,
        ros_pct: ros,
        new_orders: orders,
      };
    }

    const incomeStatementMonths = monthlyRows.map(buildStatementItems);
    // IS#1: Sort months by fiscal calendar order, not alphabetical
    incomeStatementMonths.sort((a, b) => {
      const aMonth = a.period.split(' ')[1] || '';
      const bMonth = b.period.split(' ')[1] || '';
      return fiscalMonthIndex(aMonth) - fiscalMonthIndex(bMonth);
    });
    const incomeStatementQuarters = quarterRows.map(buildStatementItems);

    // Build direct cost detail map: { period -> { cost_element -> amount } }
    const directCostByPeriod: Record<string, { label: string; amount: number }[]> = {};
    for (const r of directCostRows) {
      const period = r.period as string;
      if (!directCostByPeriod[period]) directCostByPeriod[period] = [];
      directCostByPeriod[period].push({
        label: r.cost_element as string,
        amount: Number(r.amount),
      });
    }

    // Build indirect expense detail map: { period -> { pool -> amount } }
    const indirectByPeriod: Record<string, { label: string; amount: number }[]> = {};
    for (const r of indirectRows) {
      const period = r.period as string;
      if (!indirectByPeriod[period]) indirectByPeriod[period] = [];
      indirectByPeriod[period].push({
        label: r.pool as string,
        amount: Number(r.amount),
      });
    }

    return reply.send(successEnvelope({
      kpi: kpiData,
      plan: planData,
      income_statement: {
        months: incomeStatementMonths,
        quarters: incomeStatementQuarters,
        direct_cost_detail: directCostByPeriod,
        indirect_cost_detail: indirectByPeriod,
      },
      monthly_actuals: monthlyRows.map((r) => ({
        period: r.period as string,
        source: 'Income Statement',
        orders: Number(r.actual_orders),
        sales: Number(r.actual_sales),
        ebit: Number(r.actual_ebit),
        gross_margin: Number(r.actual_gross_margin),
        ros: Number(r.actual_ros),
      })).sort((a, b) => {
        const aMonth = a.period.split(' ')[1] || '';
        const bMonth = b.period.split(' ')[1] || '';
        return fiscalMonthIndex(aMonth) - fiscalMonthIndex(bMonth);
      }),
      cost_by_pool: costByPool.map((r) => ({
        pool: r.pool as string,
        target: Number(r.total_target),
        actual: Number(r.total_actual),
        variance: Number(r.total_variance),
      })),
      meta: {
        sources: srcDocs.map((d) => ({
          vault_doc_id: Number(d.vault_doc_id),
          filename: d.filename as string,
          ingested_at: d.ingested_at as string,
          parser: 'financial_parsers_v2',
        })),
        last_refresh: srcDocs.length > 0
          ? new Date(Math.max(...srcDocs.map((d) => new Date(d.ingested_at as string).getTime()))).toISOString()
          : new Date().toISOString(),
        period: kpiData?.period ?? null,
      },
    }, req.requestId));
  });

  // GET /v3/financials/definitions
  app.get('/v3/financials/definitions', async (_req, reply) => {
    const definitions = [
      { term: 'AOP', definition: 'Annual Operating Plan. The board-approved revenue and cost targets for the fiscal year. All performance is measured against the AOP.' },
      { term: 'Backlog', definition: 'Total value of funded contract obligations not yet recognized as revenue. Backlog = Funded Value minus Revenue-to-Date.' },
      { term: 'Bookings (Orders)', definition: 'New contract awards or modifications received during the period. Bookings feed future revenue.' },
      { term: 'Book-to-Bill Ratio', definition: 'Bookings divided by Revenue for the period. A ratio above 1.0 means the company is winning more work than it is burning.' },
      { term: 'Burn Rate', definition: 'Monthly or quarterly rate at which funded backlog is consumed. Used to project contract end-dates and cash requirements.' },
      { term: 'Ceiling', definition: 'Maximum dollar value the government can obligate under a contract or task order. Not all ceiling is funded.' },
      { term: 'Cost-Plus (CP)', definition: 'Contract type where the government reimburses allowable costs plus a negotiated fee. Common in R&D and services.' },
      { term: 'CTD', definition: 'Contract-to-Date. Cumulative financial figures from contract start through the current reporting period.' },
      { term: 'Direct Labor', definition: 'Labor hours and costs charged directly to a contract. The largest cost element for most services contracts.' },
      { term: 'DSO', definition: 'Days Sales Outstanding. Average number of days to collect payment after invoicing. DSO = (Accounts Receivable / Revenue) x Days in Period.' },
      { term: 'EBIT', definition: 'Earnings Before Interest and Taxes. Operating profit before financing costs and tax effects.' },
      { term: 'Fee / Profit', definition: 'The amount earned above allowable costs. On cost-plus contracts, fee is negotiated; on FFP, profit = price minus cost.' },
      { term: 'FFP', definition: 'Firm Fixed Price. Contract type where the price is not subject to adjustment. Contractor bears cost risk.' },
      { term: 'Funded', definition: 'The amount of money the government has obligated (committed to pay) on a contract. Funded <= Ceiling.' },
      { term: 'G&A', definition: 'General & Administrative expense pool. Indirect costs that benefit the entire business (executive salaries, legal, HR, etc.).' },
      { term: 'Gross Margin', definition: 'Revenue minus Direct Costs, divided by Revenue. Measures profitability before indirect costs.' },
      { term: 'IDC', definition: 'Indirect Costs. Costs not directly billable to a contract: overhead, fringe, G&A.' },
      { term: 'LRE', definition: 'Latest Revised Estimate. Updated forecast of total contract revenue, cost, and profit reflecting current performance and known changes.' },
      { term: 'ODC', definition: 'Other Direct Costs. Non-labor direct costs: materials, travel, subcontracts, equipment.' },
      { term: 'Overhead', definition: 'Indirect cost pool applied to direct labor. Covers facilities, IT infrastructure, indirect labor support.' },
      { term: 'PoP', definition: 'Period of Performance. The contractual start and end dates during which work is authorized.' },
      { term: 'PTD', definition: 'Period-to-Date. Financial figures for the current reporting period (typically one month).' },
      { term: 'ROS', definition: 'Return on Sales. Net Income divided by Revenue. Measures overall profitability as a percentage of top-line revenue.' },
      { term: 'SIE', definition: 'Statement of Indirect Expenses. The detailed breakdown of indirect cost pools (overhead, fringe, G&A) by account.' },
      { term: 'Subcontracts', definition: 'Work performed by subcontractors under Envision prime contracts. Flows through as direct cost with a handling fee.' },
      { term: 'T&M', definition: 'Time & Materials. Contract type where the government pays negotiated hourly rates plus materials at cost. Moderate risk to contractor.' },
      { term: 'TGT vs ACT', definition: 'Target vs Actual. Comparison of planned (budget/target) amounts against actual incurred costs per cost element.' },
      { term: 'Variance', definition: 'The difference between planned and actual values. Negative variance = over budget; positive = under budget.' },
      { term: 'Wrap Rate', definition: 'The fully burdened hourly rate that includes direct labor, overhead, fringe, G&A, and fee. Used for pricing proposals.' },
      { term: 'YTD', definition: 'Year-to-Date. Cumulative financial figures from fiscal year start through the current reporting period.' },
    ];

    return reply.send(successEnvelope({
      definitions,
      meta: {
        sources: [{ type: 'static', label: 'GDA Financial Glossary' }],
        last_refresh: null,
        period: null,
      },
    }, _req.requestId));
  });

  // POST /v3/financials/ai-analyze
  app.post('/v3/financials/ai-analyze', async (req, reply) => {
    const body = req.body as {
      ytd_revenue?: number;
      ytd_expenses?: number;
      ytd_profit?: number;
      margin?: number;
      funded_backlog?: number;
      contracts?: Array<{
        name: string;
        revenue: number | null;
        cost: number | null;
        profit: number | null;
        margin: number | null;
      }>;
    };

    const input: FinancialAnalyzeInput = {
      ytd_revenue: body.ytd_revenue ?? null,
      ytd_expenses: body.ytd_expenses ?? null,
      ytd_profit: body.ytd_profit ?? null,
      margin: body.margin ?? null,
      funded_backlog: body.funded_backlog ?? null,
      contracts: body.contracts ?? [],
    };

    const result = await llmRouter.route({
      task: 'financial_analyze',
      input,
    });

    if (!result.ok) {
      return reply.status(500).send(errorEnvelope(
        'INTERNAL_ERROR',
        result.error_message ?? 'AI analysis failed',
        req.requestId,
      ));
    }

    const output = result.output as { analysis?: string } | undefined;

    return reply.send(successEnvelope({
      analysis: output?.analysis ?? 'Analysis unavailable.',
      generated_at: new Date().toISOString(),
    }, req.requestId));
  });

  // ─── Task Order CRUD (F-608) ───────────────────────────────────

  // POST /v3/financials/task-orders — create a single task order
  app.post('/v3/financials/task-orders', async (req, reply) => {
    const body = req.body as {
      to_name: string;
      to_number: string;
      parent_vehicle_id?: number | null;
      prime_or_sub: 'PRIME' | 'SUB';
      customer_agency?: string | null;
      contracting_office?: string | null;
      pop_start?: string | null;
      pop_end?: string | null;
      total_ceiling?: number | null;
      funded_to_date?: number | null;
      status?: string;
      notes?: string | null;
    };

    if (!body.to_name || !body.to_number || !body.prime_or_sub) {
      return reply.status(400).send(errorEnvelope(
        'VALIDATION_ERROR',
        'to_name, to_number, and prime_or_sub are required',
        req.requestId,
      ));
    }

    // Resolve parent vehicle short_name if parent_vehicle_id is provided
    let parentShortName: string | null = null;
    if (body.parent_vehicle_id) {
      const { rows: vRows } = await pool.query(
        'SELECT short_name FROM contract_vehicles WHERE id = $1',
        [body.parent_vehicle_id],
      );
      if (vRows.length > 0) {
        parentShortName = vRows[0].short_name as string;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO task_orders
         (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name,
          prime_or_sub, customer_agency, contracting_office,
          pop_start, pop_end, total_ceiling, funded_to_date,
          status, notes, is_seed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, FALSE)
       RETURNING id`,
      [
        body.to_name,
        body.to_number,
        body.parent_vehicle_id ?? null,
        parentShortName,
        body.prime_or_sub,
        body.customer_agency ?? null,
        body.contracting_office ?? null,
        body.pop_start ?? null,
        body.pop_end ?? null,
        body.total_ceiling ?? null,
        body.funded_to_date ?? null,
        body.status ?? 'active',
        body.notes ?? null,
      ],
    );

    return reply.status(201).send(successEnvelope({ id: rows[0].id }, req.requestId));
  });

  // POST /v3/financials/task-orders/bulk — import multiple task orders at once
  app.post('/v3/financials/task-orders/bulk', async (req, reply) => {
    const body = req.body as {
      task_orders: Array<{
        to_name: string;
        to_number: string;
        parent_vehicle_short_name?: string | null;
        prime_or_sub: 'PRIME' | 'SUB';
        customer_agency?: string | null;
        contracting_office?: string | null;
        pop_start?: string | null;
        pop_end?: string | null;
        total_ceiling?: number | null;
        funded_to_date?: number | null;
        status?: string;
        notes?: string | null;
      }>;
    };

    if (!body.task_orders || !Array.isArray(body.task_orders) || body.task_orders.length === 0) {
      return reply.status(400).send(errorEnvelope(
        'VALIDATION_ERROR',
        'task_orders array is required and must not be empty',
        req.requestId,
      ));
    }

    const ids: number[] = [];
    let skipped = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const to of body.task_orders) {
        if (!to.to_name || !to.to_number || !to.prime_or_sub) {
          skipped++;
          continue;
        }

        // Try to resolve parent vehicle by short_name
        let parentVehicleId: number | null = null;
        if (to.parent_vehicle_short_name) {
          const { rows: vRows } = await client.query(
            'SELECT id FROM contract_vehicles WHERE short_name ILIKE $1 LIMIT 1',
            [to.parent_vehicle_short_name],
          );
          if (vRows.length > 0) parentVehicleId = Number(vRows[0].id);
        }

        const { rows } = await client.query(
          `INSERT INTO task_orders
             (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name,
              prime_or_sub, customer_agency, contracting_office,
              pop_start, pop_end, total_ceiling, funded_to_date,
              status, notes, is_seed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, FALSE)
           RETURNING id`,
          [
            to.to_name,
            to.to_number,
            parentVehicleId,
            to.parent_vehicle_short_name ?? null,
            to.prime_or_sub,
            to.customer_agency ?? null,
            to.contracting_office ?? null,
            to.pop_start ?? null,
            to.pop_end ?? null,
            to.total_ceiling ?? null,
            to.funded_to_date ?? null,
            to.status ?? 'active',
            to.notes ?? null,
          ],
        );
        ids.push(Number(rows[0].id));
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return reply.status(201).send(successEnvelope({
      inserted: ids.length,
      skipped,
      ids,
    }, req.requestId));
  });

  // DELETE /v3/financials/task-orders/:id — delete a single task order
  app.delete('/v3/financials/task-orders/:id', async (req, reply) => {
    const id = Number((req.params as Record<string, string>).id);
    if (!id || isNaN(id)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid task order ID', req.requestId));
    }

    const { rowCount } = await pool.query(
      'DELETE FROM task_orders WHERE id = $1',
      [id],
    );

    if (!rowCount) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Task order not found', req.requestId));
    }

    return reply.send(successEnvelope({ deleted: true }, req.requestId));
  });

  // ─── Project Financial Drill-Down (F-628) ───────────────────────

  // Helper: map a project_revenue_actuals row to full JSON shape
  function mapProjectRow(r: Record<string, unknown>) {
    return {
      id: Number(r.id),
      period: r.period as string,
      fiscal_year: Number(r.fiscal_year),
      quarter: r.quarter != null ? Number(r.quarter) : null,
      project_id: (r.project_id as string) ?? null,
      project_name: r.project_name as string,
      contract_number: (r.contract_number as string) ?? null,
      revenue: Number(r.revenue ?? 0),
      cost: Number(r.cost ?? 0),
      profit: Number(r.profit ?? 0),
      margin_pct: r.margin_pct != null ? Number(r.margin_pct) : null,
      itd_value: Number(r.itd_value ?? 0),
      itd_funding: Number(r.itd_funding ?? 0),
      itd_billed_amount: Number(r.itd_billed_amount ?? 0),
      open_ar: Number(r.open_ar ?? 0),
      prior_year_costs: Number(r.prior_year_costs ?? 0),
      prior_year_profit: Number(r.prior_year_profit ?? 0),
      prior_year_revenue: Number(r.prior_year_revenue ?? 0),
      actual_period_costs: Number(r.actual_period_costs ?? 0),
      actual_period_profit: Number(r.actual_period_profit ?? 0),
      actual_period_revenue: Number(r.actual_period_revenue ?? 0),
      actual_ytd_costs: Number(r.actual_ytd_costs ?? 0),
      actual_ytd_profit: Number(r.actual_ytd_profit ?? 0),
      actual_ytd_revenue: Number(r.actual_ytd_revenue ?? 0),
      actual_itd_costs: Number(r.actual_itd_costs ?? 0),
      actual_itd_profit: Number(r.actual_itd_profit ?? 0),
      actual_itd_revenue: Number(r.actual_itd_revenue ?? 0),
      target_period_costs: Number(r.target_period_costs ?? 0),
      target_period_profit: Number(r.target_period_profit ?? 0),
      target_period_revenue: Number(r.target_period_revenue ?? 0),
      target_ytd_costs: Number(r.target_ytd_costs ?? 0),
      target_ytd_profit: Number(r.target_ytd_profit ?? 0),
      target_ytd_revenue: Number(r.target_ytd_revenue ?? 0),
      target_itd_costs: Number(r.target_itd_costs ?? 0),
      target_itd_profit: Number(r.target_itd_profit ?? 0),
      target_itd_revenue: Number(r.target_itd_revenue ?? 0),
      source_doc_id: r.source_doc_id != null ? Number(r.source_doc_id) : null,
    };
  }

  // GET /v3/financials/projects — list projects for selected period
  app.get('/v3/financials/projects', async (req, reply) => {
    noStore(reply);
    const q = req.query as Record<string, string>;
    const period = q.period || null;

    let sql: string;
    const params: string[] = [];

    if (period) {
      sql = `SELECT * FROM project_revenue_actuals WHERE period = $1
             ORDER BY project_name`;
      params.push(period);
    } else {
      // Default: latest period with data
      sql = `SELECT * FROM project_revenue_actuals
             WHERE period = (
               SELECT period FROM project_revenue_actuals
               ORDER BY fiscal_year DESC, quarter DESC NULLS LAST, period DESC
               LIMIT 1
             )
             ORDER BY project_name`;
    }

    const { rows } = await pool.query(sql, params);
    const items = rows.map(mapProjectRow);

    // Distinct periods for the period selector
    const { rows: periodRows } = await pool.query(
      `SELECT DISTINCT period, fiscal_year, quarter
       FROM project_revenue_actuals
       ORDER BY fiscal_year DESC, quarter DESC NULLS LAST, period DESC`,
    );

    return reply.send(successEnvelope({
      items,
      periods: periodRows.map((p) => p.period as string),
      meta: { table: 'project_revenue_actuals', row_count: items.length },
    }, req.requestId));
  });

  // GET /v3/financials/projects/:projectKey — single project snapshot
  // projectKey = project_id (e.g. "1010.003") or project_name
  app.get('/v3/financials/projects/:projectKey', async (req, reply) => {
    noStore(reply);
    const projectKey = decodeURIComponent((req.params as Record<string, string>).projectKey);
    const q = req.query as Record<string, string>;
    const period = q.period || null;

    let sql: string;
    const params: string[] = [projectKey, projectKey];

    if (period) {
      sql = `SELECT * FROM project_revenue_actuals
             WHERE (COALESCE(project_id, '') = $1 OR project_name = $2) AND period = $3
             LIMIT 1`;
      params.push(period);
    } else {
      sql = `SELECT * FROM project_revenue_actuals
             WHERE COALESCE(project_id, '') = $1 OR project_name = $2
             ORDER BY fiscal_year DESC, quarter DESC NULLS LAST, period DESC
             LIMIT 1`;
    }

    const { rows } = await pool.query(sql, params);
    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Project not found', req.requestId));
    }

    return reply.send(successEnvelope({ project: mapProjectRow(rows[0]) }, req.requestId));
  });

  // GET /v3/financials/projects/:projectKey/trend — monthly rows for trend chart
  app.get('/v3/financials/projects/:projectKey/trend', async (req, reply) => {
    noStore(reply);
    const projectKey = decodeURIComponent((req.params as Record<string, string>).projectKey);

    const { rows } = await pool.query(
      `SELECT * FROM project_revenue_actuals
       WHERE COALESCE(project_id, '') = $1 OR project_name = $2
       ORDER BY fiscal_year ASC, quarter ASC NULLS LAST, period ASC`,
      [projectKey, projectKey],
    );

    return reply.send(successEnvelope({
      items: rows.map(mapProjectRow),
    }, req.requestId));
  });
}
