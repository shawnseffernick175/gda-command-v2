import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

export async function financialsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/kpi/header
  app.get('/v3/kpi/header', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT
         a.period,
         a.actual_orders, a.actual_sales, a.actual_ebit,
         a.actual_gross_margin, a.actual_ros,
         p.plan_orders, p.plan_sales, p.plan_ebit,
         p.plan_gross_margin, p.plan_ros
       FROM financial_actuals a
       JOIN financial_plan p ON p.fiscal_year = a.fiscal_year AND p.quarter = a.quarter
       ORDER BY a.fiscal_year DESC, a.quarter DESC
       LIMIT 1`,
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'No financial data available', req.requestId));
    }

    const r = rows[0];
    const delta = (actual: number, plan: number) =>
      plan === 0 ? 0 : Number((((actual - plan) / plan) * 100).toFixed(1));

    const data = {
      orders: {
        value: Number(r.actual_orders),
        delta: delta(Number(r.actual_orders), Number(r.plan_orders)),
        plan: Number(r.plan_orders),
      },
      sales: {
        value: Number(r.actual_sales),
        delta: delta(Number(r.actual_sales), Number(r.plan_sales)),
        plan: Number(r.plan_sales),
      },
      ebit: {
        value: Number(r.actual_ebit),
        delta: delta(Number(r.actual_ebit), Number(r.plan_ebit)),
        plan: Number(r.plan_ebit),
      },
      gross_margin: {
        value: Number(r.actual_gross_margin),
        delta: delta(Number(r.actual_gross_margin), Number(r.plan_gross_margin)),
        plan: Number(r.plan_gross_margin),
      },
      ros: {
        value: Number(r.actual_ros),
        delta: delta(Number(r.actual_ros), Number(r.plan_ros)),
        plan: Number(r.plan_ros),
      },
    };

    return reply.send(successEnvelope(data, req.requestId));
  });

  // GET /v3/financials/forecast
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
       LEFT JOIN financial_actuals a ON a.fiscal_year = p.fiscal_year AND a.quarter = p.quarter
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
  app.get('/v3/financials/trend', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT period, actual_orders AS orders, actual_sales AS sales,
              actual_ebit AS ebit, actual_gross_margin AS gross_margin,
              actual_ros AS ros
       FROM financial_actuals
       ORDER BY fiscal_year, quarter`,
    );

    const items = rows.map((r) => ({
      period: r.period as string,
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
}
