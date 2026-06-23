import type { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import type { FinancialAnalyzeInput } from '../lib/llm-router.types.js';
import { recordAuditLog } from '../services/audit/audit-log.js';

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

export async function financialsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/kpi/header
  // Headline KPIs: LEFT JOIN so actuals display even when plan is missing.
  // Returns plan: null and delta: null per metric when plan is absent.
  // Only 404s when BOTH actuals AND plan are completely empty.
  app.get('/v3/kpi/header', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT
         a.period,
         a.actual_orders, a.actual_sales, a.actual_ebit,
         a.actual_gross_margin, a.actual_ros,
         p.plan_orders, p.plan_sales, p.plan_ebit,
         p.plan_gross_margin, p.plan_ros
       FROM financial_actuals a
       LEFT JOIN financial_plan p
         ON p.fiscal_year = a.fiscal_year AND p.quarter = a.quarter
        AND p.source = 'l1_target' AND p.period LIKE '%Q%'
       WHERE a.source = 'income_statement' AND a.period LIKE '%Q%'
       ORDER BY a.fiscal_year DESC, a.quarter DESC
       LIMIT 1`,
    );

    if (!rows.length) {
      // Fallback: check if plan-only rows exist (no actuals yet)
      const { rows: planOnly } = await pool.query(
        `SELECT 1 FROM financial_plan WHERE source = 'l1_target' LIMIT 1`,
      );
      if (!planOnly.length) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'No financial data available', req.requestId));
      }
      // Plan exists but no actuals — return empty actuals with plan
      const { rows: pRows } = await pool.query(
        `SELECT period, plan_orders, plan_sales, plan_ebit,
                plan_gross_margin, plan_ros
         FROM financial_plan
         WHERE source = 'l1_target' AND period LIKE '%Q%'
         ORDER BY fiscal_year DESC, quarter DESC
         LIMIT 1`,
      );
      if (!pRows.length) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'No financial data available', req.requestId));
      }
      const p = pRows[0];
      const data = {
        period: p.period as string,
        orders: { value: 0, delta: null, plan: Number(p.plan_orders) },
        sales: { value: 0, delta: null, plan: Number(p.plan_sales) },
        ebit: { value: 0, delta: null, plan: Number(p.plan_ebit) },
        gross_margin: { value: 0, delta: null, plan: Number(p.plan_gross_margin) },
        ros: { value: 0, delta: null, plan: Number(p.plan_ros) },
      };
      return reply.send(successEnvelope(data, req.requestId));
    }

    const r = rows[0];
    const hasPlan = r.plan_orders !== null;
    const delta = (actual: number, plan: number | null) =>
      plan === null || plan === 0 ? null : Number((((actual - plan) / plan) * 100).toFixed(1));

    const data = {
      period: r.period as string,
      orders: {
        value: Number(r.actual_orders),
        delta: hasPlan ? delta(Number(r.actual_orders), Number(r.plan_orders)) : null,
        plan: hasPlan ? Number(r.plan_orders) : null,
      },
      sales: {
        value: Number(r.actual_sales),
        delta: hasPlan ? delta(Number(r.actual_sales), Number(r.plan_sales)) : null,
        plan: hasPlan ? Number(r.plan_sales) : null,
      },
      ebit: {
        value: Number(r.actual_ebit),
        delta: hasPlan ? delta(Number(r.actual_ebit), Number(r.plan_ebit)) : null,
        plan: hasPlan ? Number(r.plan_ebit) : null,
      },
      gross_margin: {
        value: Number(r.actual_gross_margin),
        delta: hasPlan ? delta(Number(r.actual_gross_margin), Number(r.plan_gross_margin)) : null,
        plan: hasPlan ? Number(r.plan_gross_margin) : null,
      },
      ros: {
        value: Number(r.actual_ros),
        delta: hasPlan ? delta(Number(r.actual_ros), Number(r.plan_ros)) : null,
        plan: hasPlan ? Number(r.plan_ros) : null,
      },
    };

    return reply.send(successEnvelope(data, req.requestId));
  });

  // GET /v3/financials/forecast
  // Quarter-level plan vs actuals. Use the l1_target plan quarter rows against
  // the income_statement actuals quarter rows (period LIKE '%Q%') so the join
  // stays 1:1 per quarter now that several source-series coexist.
  app.get('/v3/financials/forecast', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT
         p.period,
         p.plan_orders,
         p.plan_sales,
         COALESCE(a.actual_orders, 0) AS actual_orders,
         COALESCE(a.actual_sales, 0)  AS actual_sales,
         (a.id IS NOT NULL) AS has_actuals
       FROM financial_plan p
       LEFT JOIN financial_actuals a
         ON a.fiscal_year = p.fiscal_year AND a.quarter = p.quarter
        AND a.source = 'income_statement' AND a.period LIKE '%Q%'
       WHERE p.source = 'l1_target' AND p.period LIKE '%Q%'
       ORDER BY p.fiscal_year, p.quarter`,
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
    const { rows } = await pool.query(
      `SELECT source, period, fiscal_year, quarter,
              (period LIKE '%Q%') AS is_quarter,
              actual_orders AS orders, actual_sales AS sales,
              actual_ebit AS ebit, actual_gross_margin AS gross_margin,
              actual_ros AS ros
       FROM financial_actuals
       ORDER BY source, fiscal_year, quarter, (period LIKE '%Q%'), period`,
    );

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

    return reply.send(successEnvelope({ items }, req.requestId));
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

    const { rows } = await pool.query(
      `SELECT period, fiscal_year, quarter, cost_element, pool,
              target_amount, actual_amount, variance_amount
       FROM cost_detail_actuals
       ${whereClause}
       ORDER BY cost_element, pool`,
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
    const { rows } = await pool.query(
      `SELECT period, fiscal_year, quarter, cost_element, pool,
              target_amount, actual_amount, variance_amount
       FROM cost_detail_actuals
       ORDER BY fiscal_year, quarter, period, cost_element, pool`,
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

    const { rows } = await pool.query(
      `SELECT period, fiscal_year, quarter, pool, account_code, account_name,
              current_period_actual, current_period_budget,
              ytd_actual, ytd_budget
       FROM indirect_expense_actuals
       ${whereClause}
       ORDER BY pool, account_code NULLS LAST, account_name`,
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
    const { rows } = await pool.query(
      `SELECT period, fiscal_year, quarter, pool,
              SUM(current_period_actual) AS period_actual,
              SUM(current_period_budget) AS period_budget,
              SUM(ytd_actual) AS ytd_actual,
              SUM(ytd_budget) AS ytd_budget
       FROM indirect_expense_actuals
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
  // Returns task orders (NOT IDIQs) for the Gantt waterfall view.
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

    const { rows } = await pool.query(
      `SELECT t.id, t.to_name, t.to_number,
              t.parent_vehicle_id, t.parent_vehicle_short_name,
              t.prime_or_sub, t.customer_agency, t.contracting_office,
              t.pop_start, t.pop_end, t.base_pop_end,
              t.option_periods, t.total_ceiling, t.funded_to_date,
              t.status, t.cpars_status, t.notes,
              cv.short_name AS cv_short_name
       FROM task_orders t
       LEFT JOIN contract_vehicles cv ON cv.id = t.parent_vehicle_id
       ${whereClause}
       ORDER BY t.parent_vehicle_short_name NULLS LAST, t.pop_end NULLS LAST, t.to_name`,
      params,
    );

    // Assign colors per parent IDIQ for grouping
    const vehicleColors: Record<string, string> = {
      'RS3': '#01696F',
      'TRAYSYS': '#2D6A4F',
      'Seaport NxG': '#1B4332',
      'GSA MAS': '#3D405B',
      'OASIS SB Pool 1': '#5F0F40',
      'OASIS SB Pool 3': '#6A4C93',
      'eFAST': '#264653',
      'EAGLE': '#2A9D8F',
      'TSS-E': '#E76F51',
      'CIO-SP3 SB': '#F4A261',
      'CIO-SP3 8(a)': '#E9C46A',
    };

    const taskOrders = rows.map((r) => {
      const popEnd = r.pop_end ? new Date(r.pop_end as string) : null;
      const todayDate = new Date(today);
      const daysUntilExpiration = popEnd
        ? Math.ceil((popEnd.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const parentShort = (r.parent_vehicle_short_name as string | null) ?? (r.cv_short_name as string | null);

      return {
        id: Number(r.id),
        to_name: r.to_name as string,
        to_number: r.to_number as string,
        parent_vehicle_id: r.parent_vehicle_id ? Number(r.parent_vehicle_id) : null,
        parent_vehicle_short_name: parentShort,
        parent_color: parentShort ? (vehicleColors[parentShort] ?? '#7A7974') : '#7A7974',
        prime_or_sub: r.prime_or_sub as string,
        customer_agency: r.customer_agency as string | null,
        contracting_office: r.contracting_office as string | null,
        pop_start: r.pop_start ? (r.pop_start as string) : null,
        pop_end: r.pop_end ? (r.pop_end as string) : null,
        base_pop_end: r.base_pop_end ? (r.base_pop_end as string) : null,
        option_periods: r.option_periods ?? null,
        ceiling: r.total_ceiling !== null ? Number(r.total_ceiling) : null,
        funded_to_date: r.funded_to_date !== null ? Number(r.funded_to_date) : null,
        status: r.status as string,
        cpars_status: r.cpars_status as string | null,
        days_until_expiration: daysUntilExpiration,
        is_expiring_soon: daysUntilExpiration !== null && daysUntilExpiration > 0 && daysUntilExpiration <= 365,
        notes: r.notes as string | null,
      };
    });

    // Compute range metadata
    const allStarts = taskOrders.filter((t) => t.pop_start).map((t) => t.pop_start as string);
    const allEnds = taskOrders.filter((t) => t.pop_end).map((t) => t.pop_end as string);
    const earliestPop = allStarts.length > 0 ? allStarts.sort()[0] : null;
    const latestPop = allEnds.length > 0 ? allEnds.sort().reverse()[0] : null;

    // Fetch available parent vehicles for filters (only from real data)
    const { rows: vehicleRows } = await pool.query(
      `SELECT DISTINCT cv.id, cv.short_name
       FROM contract_vehicles cv
       INNER JOIN task_orders t ON t.parent_vehicle_id = cv.id
       WHERE t.is_seed = FALSE
       ORDER BY cv.short_name`,
    );

    return reply.send(successEnvelope({
      task_orders: taskOrders,
      today,
      earliest_pop: earliestPop,
      latest_pop: latestPop,
      available_vehicles: vehicleRows.map((v) => ({ id: Number(v.id), short_name: v.short_name as string })),
      meta: {
        sources: [{ table: 'task_orders', row_count: taskOrders.length }],
        last_refresh: new Date().toISOString(),
        period: null,
      },
    }, req.requestId));
  });

  // GET /v3/financials/aop-execution?fy=FY26
  app.get('/v3/financials/aop-execution', async (req, reply) => {
    noStore(reply);
    const fy = (req.query as Record<string, string>).fy ?? 'FY26';
    const fiscalYear = parseInt(fy.replace(/\D/g, ''), 10) || 2026;

    const { rows } = await pool.query(
      `SELECT period, cost_element, pool,
              SUM(target_amount) AS planned,
              SUM(actual_amount) AS actual,
              SUM(variance_amount) AS variance
       FROM cost_detail_actuals
       WHERE fiscal_year = $1
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

    // Build the full 12-month plan-vs-actual axis dynamically from AOP_MONTHS.
    // Two separate queries (plan + actuals), then join in JS so every month is
    // always represented — even months with no actuals yet.
    const fyShort = `FY${fiscalYear % 100}`;

    const { rows: planRows } = await pool.query(
      `SELECT period, plan_orders, plan_sales, plan_ebit,
              plan_gross_margin, plan_ros
       FROM financial_plan
       WHERE source = 'user_aop' AND is_seed = false
         AND fiscal_year = $1 AND period NOT LIKE '%Q%'`,
      [fiscalYear],
    );

    const hasPlan = planRows.length > 0;
    const planByPeriod = new Map<string, (typeof planRows)[0]>();
    for (const r of planRows) planByPeriod.set(r.period as string, r);

    const { rows: actualRows } = await pool.query(
      `SELECT period, actual_orders, actual_sales, actual_ebit,
              actual_gross_margin, actual_ros
       FROM financial_actuals
       WHERE source = 'income_statement' AND fiscal_year = $1
         AND period NOT LIKE '%Q%'`,
      [fiscalYear],
    );

    const actualByPeriod = new Map<string, (typeof actualRows)[0]>();
    for (const r of actualRows) actualByPeriod.set(r.period as string, r);

    // Always 12 rows, Jan–Dec, regardless of what's in the DB.
    const planActualRows = AOP_MONTHS.map(({ mon }) => {
      const period = `${fyShort} ${mon}`;
      const plan = planByPeriod.get(period);
      const actual = actualByPeriod.get(period);
      return {
        period,
        plan_source: hasPlan ? 'user_aop' : null,
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
        const plan = planRaw !== null && planRaw !== undefined ? Number(planRaw) : 0;
        const actual = actualRaw !== null && actualRaw !== undefined ? Number(actualRaw) : null;
        return {
          period: r.period as string,
          plan,
          actual,
          variance: actual !== null ? actual - plan : null,
        };
      });
      const monthsWithActual = months.filter((m) => m.actual !== null);
      let planTotal: number;
      let actualTotal: number | null;
      if (def.kind === 'percent') {
        // Average across months; actual averaged only over months that have data.
        planTotal = months.length
          ? months.reduce((s, m) => s + m.plan, 0) / months.length
          : 0;
        actualTotal = monthsWithActual.length
          ? monthsWithActual.reduce((s, m) => s + (m.actual ?? 0), 0) / monthsWithActual.length
          : null;
      } else {
        planTotal = months.reduce((s, m) => s + m.plan, 0);
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
        variance_total: actualTotal !== null ? actualTotal - planTotal : null,
      };
    });

    // Keep `revenue` for backward-compatibility (the Sales block).
    const revenue = metrics.find((m) => m.key === 'sales') ?? null;

    const planSource = hasPlan ? 'user_aop' : null;

    return reply.send(successEnvelope({
      items,
      metrics,
      revenue,
      has_plan: hasPlan,
      plan_source: planSource,
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

  // The 12 fiscal-year months in order, with their calendar quarter (ceil(m/3)).
  const AOP_MONTHS: ReadonlyArray<{ mon: string; quarter: number }> = [
    { mon: 'Jan', quarter: 1 }, { mon: 'Feb', quarter: 1 }, { mon: 'Mar', quarter: 1 },
    { mon: 'Apr', quarter: 2 }, { mon: 'May', quarter: 2 }, { mon: 'Jun', quarter: 2 },
    { mon: 'Jul', quarter: 3 }, { mon: 'Aug', quarter: 3 }, { mon: 'Sep', quarter: 3 },
    { mon: 'Oct', quarter: 4 }, { mon: 'Nov', quarter: 4 }, { mon: 'Dec', quarter: 4 },
  ];

  // GET /v3/financials/aop-plan?fy=FY26
  // Returns the owner's annual AOP plan for a fiscal year (reconstructed from the
  // stored monthly rows), or nulls when none has been entered yet.
  app.get('/v3/financials/aop-plan', async (req, reply) => {
    noStore(reply);
    const fy = (req.query as Record<string, string>).fy ?? 'FY26';
    const fiscalYear = parseInt(fy.replace(/\D/g, ''), 10) || 2026;

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
    const fiscalYear = parseInt(fyRaw.replace(/\D/g, ''), 10);
    if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'A valid fiscal year (e.g. "FY26") is required', req.requestId));
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

      for (const { mon, quarter } of AOP_MONTHS) {
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
      months_written: AOP_MONTHS.length,
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
    const fiscalYear = fyRaw ? parseInt(fyRaw.replace(/\D/g, ''), 10) : null;

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
    const captureStages = ['interest', 'qualify', 'pursue', 'proposal', 'post_submittal'];

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

    // Cost detail aggregated by pool (contract P&L proxy)
    const { rows: costByPool } = await pool.query(
      `SELECT pool,
              SUM(target_amount) AS total_target,
              SUM(actual_amount) AS total_actual,
              SUM(variance_amount) AS total_variance
       FROM cost_detail_actuals
       GROUP BY pool
       ORDER BY SUM(actual_amount) DESC`,
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
    const incomeStatementQuarters = quarterRows.map(buildStatementItems);

    return reply.send(successEnvelope({
      kpi: kpiData,
      plan: planData,
      income_statement: {
        months: incomeStatementMonths,
        quarters: incomeStatementQuarters,
      },
      monthly_actuals: monthlyRows.map((r) => ({
        period: r.period as string,
        source: 'Income Statement',
        orders: Number(r.actual_orders),
        sales: Number(r.actual_sales),
        ebit: Number(r.actual_ebit),
        gross_margin: Number(r.actual_gross_margin),
        ros: Number(r.actual_ros),
      })),
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
}
