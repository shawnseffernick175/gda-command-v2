import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import type { FinancialAnalyzeInput } from '../lib/llm-router.types.js';

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
         (SELECT MAX(created_at) FROM indirect_expense_actuals)
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
         )
       ORDER BY vd.filename`,
    );

    return reply.send(successEnvelope({
      docs_ingested: Number(docCounts?.docs_ingested ?? 0),
      docs_total: Number(docCounts?.docs_total ?? 0),
      max_period: (periodRow?.max_period as string) ?? null,
      last_refresh: (refreshRow?.last_refresh as string) ?? null,
      doc_filenames: docFiles.map((d) => d.filename as string),
    }, req.requestId));
  });

  // GET /v3/financials/contract-waterfall?fy=FY26
  app.get('/v3/financials/contract-waterfall', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, short_name, contract_number, vehicle_type,
              agency, naics_primary, expiration_date,
              ceiling_value, is_active, notes
       FROM contract_vehicles
       ORDER BY is_active DESC, name`,
    );

    const contracts = rows.map((r) => ({
      id: Number(r.id),
      name: r.name as string,
      short_name: r.short_name as string,
      contract_number: r.contract_number as string | null,
      vehicle_type: r.vehicle_type as string,
      agency: r.agency as string | null,
      naics_primary: r.naics_primary as string | null,
      expiration_date: r.expiration_date as string | null,
      ceiling_value: r.ceiling_value !== null ? Number(r.ceiling_value) : null,
      is_active: Boolean(r.is_active),
      notes: r.notes as string | null,
    }));

    const { rows: [metaRow] } = await pool.query(
      `SELECT MAX(updated_at) AS last_refresh FROM contract_vehicles`,
    );

    return reply.send(successEnvelope({
      contracts,
      meta: {
        sources: [{ table: 'contract_vehicles', row_count: contracts.length }],
        last_refresh: (metaRow?.last_refresh as string) ?? new Date().toISOString(),
        period: null,
      },
    }, req.requestId));
  });

  // GET /v3/financials/aop-execution?fy=FY26
  app.get('/v3/financials/aop-execution', async (req, reply) => {
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

    return reply.send(successEnvelope({
      items,
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

  // GET /v3/financials/aop-capture?fy=FY26
  app.get('/v3/financials/aop-capture', async (req, reply) => {
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

    // Monthly actuals for income statement detail
    const { rows: monthlyRows } = await pool.query(
      `SELECT period, fiscal_year, quarter, source,
              actual_orders, actual_sales, actual_ebit,
              actual_gross_margin, actual_ros
       FROM financial_actuals
       WHERE period NOT LIKE '%Q%'
       ORDER BY fiscal_year, quarter, period`,
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

    return reply.send(successEnvelope({
      kpi: kpiData,
      plan: planData,
      monthly_actuals: monthlyRows.map((r) => ({
        period: r.period as string,
        source: r.source as string,
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
}
