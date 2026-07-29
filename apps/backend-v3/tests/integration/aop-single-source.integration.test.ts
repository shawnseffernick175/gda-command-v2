/**
 * Batch B — AOP single source of truth (integration).
 *
 * The Annual Operating Plan revenue target must read identically from the
 * Financial Bible (`GET /v3/financials/aop-plan`) and Pipeline Coverage
 * (`GET /v3/pipeline/coverage`), no matter which surface last wrote it. These
 * tests exercise the propagation end-to-end against a real migrated DB:
 *
 *   1. Bible annual save   → Pipeline Coverage reflects the same annual target
 *   2. Bible per-month edit → annual = sum of months, Pipeline reflects the sum
 *   3. Pipeline write       → Bible monthly plan (÷12) reflects the same value
 *   4. Fiscal-year isolation (a FY27 write never touches FY26)
 *   5. Every write leaves an audit_log row
 *   6. Historical rows (prior FY, legacy quarterly) are preserved
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;

const JSON_HEADERS = { ...authHeader(), 'content-type': 'application/json' };

async function saveAnnualPlan(fy: string, planSales: number): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/v3/financials/aop-plan',
    headers: JSON_HEADERS,
    payload: {
      fy,
      plan_orders: planSales,
      plan_sales: planSales,
      plan_ebit: planSales * 0.15,
      plan_gross_margin: 38,
      plan_ros: 13,
    },
  });
  expect(res.statusCode).toBe(200);
}

async function pipelineAopTarget(fy: number): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: `/v3/pipeline/coverage?fy=${fy}`,
    headers: authHeader(),
  });
  expect(res.statusCode).toBe(200);
  return Number(res.json().data.aop_target);
}

async function bibleAnnualSales(fy: string): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: `/v3/financials/aop-plan?fy=${fy}`,
    headers: authHeader(),
  });
  expect(res.statusCode).toBe(200);
  return Number(res.json().data.plan.plan_sales);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getDbUrl(), max: 5 });
  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  // Clean AOP plan rows for the FYs under test; reset the mirror to a known base.
  await pool.query(
    `DELETE FROM financial_plan WHERE fiscal_year IN (2026, 2027) AND source IN ('user_aop', 'aop_seed')`,
  );
  await pool.query(
    `UPDATE wheelhouse_config
        SET aop_revenue_target_fy26 = 44800000,
            aop_revenue_target_fy27 = 50200000
      WHERE id = 1`,
  );
});

describe('AOP single source of truth', () => {
  it('propagates a Bible annual save to Pipeline Coverage', async () => {
    await saveAnnualPlan('FY26', 36_000_000);
    expect(await pipelineAopTarget(2026)).toBe(36_000_000);
    expect(await bibleAnnualSales('FY26')).toBe(36_000_000);
  });

  it('keeps annual = sum of months when a single month is adjusted', async () => {
    await saveAnnualPlan('FY26', 36_000_000); // 12 × 3,000,000

    // Bump FY26 Jan from 3.0M to 6.0M → annual should rise by 3.0M to 39.0M.
    const patch = await app.inject({
      method: 'PATCH',
      url: '/v3/financials/aop-plan/month',
      headers: JSON_HEADERS,
      payload: { fy: 'FY26', period: 'FY26 Jan', plan_sales: 6_000_000 },
    });
    expect(patch.statusCode).toBe(200);
    expect(Number(patch.json().data.annual_aop)).toBe(39_000_000);

    expect(await pipelineAopTarget(2026)).toBe(39_000_000);
    expect(await bibleAnnualSales('FY26')).toBe(39_000_000);
  });

  it('rejects a per-month edit when no annual plan exists yet', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/v3/financials/aop-plan/month',
      headers: JSON_HEADERS,
      payload: { fy: 'FY26', period: 'FY26 Jan', plan_sales: 1_000_000 },
    });
    expect(patch.statusCode).toBe(404);
  });

  it('propagates a Pipeline write into the Bible monthly plan (÷12)', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/v3/pipeline/coverage/aop-target',
      headers: JSON_HEADERS,
      payload: { fy: 2026, aop_revenue_target: 48_000_000 },
    });
    expect(patch.statusCode).toBe(200);
    expect(Number(patch.json().data.aop_target)).toBe(48_000_000);

    // Pipeline and Bible now agree, and each month is the even ÷12 split.
    expect(await pipelineAopTarget(2026)).toBe(48_000_000);
    expect(await bibleAnnualSales('FY26')).toBe(48_000_000);

    const planRes = await app.inject({
      method: 'GET',
      url: '/v3/financials/aop-plan?fy=FY26',
      headers: authHeader(),
    });
    const months = planRes.json().data.months as Array<{ plan_sales: number | null }>;
    expect(months).toHaveLength(12);
    for (const m of months) expect(m.plan_sales).toBe(4_000_000);
  });

  it('isolates fiscal years — a FY27 write never touches FY26', async () => {
    await saveAnnualPlan('FY26', 36_000_000);

    const patch = await app.inject({
      method: 'PATCH',
      url: '/v3/pipeline/coverage/aop-target',
      headers: JSON_HEADERS,
      payload: { fy: 2027, aop_revenue_target: 60_000_000 },
    });
    expect(patch.statusCode).toBe(200);

    expect(await pipelineAopTarget(2027)).toBe(60_000_000);
    expect(await pipelineAopTarget(2026)).toBe(36_000_000);
  });

  it('writes an audit_log row for every AOP write path', async () => {
    await saveAnnualPlan('FY26', 36_000_000);
    await app.inject({
      method: 'PATCH',
      url: '/v3/financials/aop-plan/month',
      headers: JSON_HEADERS,
      payload: { fy: 'FY26', period: 'FY26 Feb', plan_sales: 5_000_000 },
    });
    await app.inject({
      method: 'PATCH',
      url: '/v3/pipeline/coverage/aop-target',
      headers: JSON_HEADERS,
      payload: { fy: 2026, aop_revenue_target: 42_000_000 },
    });

    // The annual-save audit is best-effort (fire-and-forget after the response),
    // so poll briefly for all three actions to land.
    const want = ['financial_plan_upsert', 'financial_plan_month_update', 'aop_target_update'];
    let actions: string[] = [];
    for (let i = 0; i < 20; i++) {
      const { rows } = await pool.query<{ action: string }>(
        `SELECT DISTINCT action FROM audit_log WHERE action = ANY($1)`,
        [want],
      );
      actions = rows.map((r) => r.action);
      if (want.every((a) => actions.includes(a))) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    for (const a of want) expect(actions).toContain(a);
  });

  it('preserves prior fiscal-year plan rows on an annual save', async () => {
    // Seed a prior-FY (FY25) monthly row — a FY26 save must never touch it.
    await pool.query(
      `DELETE FROM financial_plan WHERE fiscal_year = 2025 AND period = 'FY25 Jan'`,
    );
    await pool.query(
      `INSERT INTO financial_plan (period, fiscal_year, quarter, plan_sales, is_seed, source)
       VALUES ('FY25 Jan', 2025, 1, 1234567, false, 'user_aop')`,
    );

    await saveAnnualPlan('FY26', 36_000_000);

    const prior = await pool.query(
      `SELECT plan_sales FROM financial_plan WHERE period = 'FY25 Jan' AND fiscal_year = 2025`,
    );
    expect(prior.rows).toHaveLength(1);
    expect(Number(prior.rows[0]!.plan_sales)).toBe(1234567);
    expect(await pipelineAopTarget(2026)).toBe(36_000_000);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM financial_plan WHERE fiscal_year = 2025 AND period = 'FY25 Jan'`);
  });
});
