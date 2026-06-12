import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

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
}
