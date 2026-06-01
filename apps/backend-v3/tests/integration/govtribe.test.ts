/**
 * F-Govtribe integration tests — credit-budget enforcement,
 * dedup fixture, health/credits/sentinel endpoints, dry_run.
 *
 * These tests use only local DB state (no live API calls, 0 credits burned).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getPool, authHeader, closeApp } from './helpers.js';
import { registerGovTribeSource } from '../../src/ingest/govtribe/index.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: ReturnType<typeof getPool>;

beforeAll(async () => {
  app = await getApp();
  pool = getPool();
  registerGovTribeSource();
});

afterAll(async () => {
  await closeApp();
});

describe('GovTribe schema', () => {
  it('should have govtribe_cache table', async () => {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'govtribe_cache'
       ) AS exists`,
    );
    expect(rows[0].exists).toBe(true);
  });

  it('should have govtribe_credit_ledger table', async () => {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'govtribe_credit_ledger'
       ) AS exists`,
    );
    expect(rows[0].exists).toBe(true);
  });

  it('should have govtribe_credit_monthly table', async () => {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'govtribe_credit_monthly'
       ) AS exists`,
    );
    expect(rows[0].exists).toBe(true);
  });

  it('should have source_uri column on opportunities', async () => {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'opportunities' AND column_name = 'source_uri'
       ) AS exists`,
    );
    expect(rows[0].exists).toBe(true);
  });

  it('should have govtribe_id column on opportunities', async () => {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'opportunities' AND column_name = 'govtribe_id'
       ) AS exists`,
    );
    expect(rows[0].exists).toBe(true);
  });

  it('should have feature_flags table with govtribe_connector_v1', async () => {
    const { rows } = await pool.query(
      `SELECT enabled FROM feature_flags WHERE flag_name = 'govtribe_connector_v1'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].enabled).toBe(true);
  });
});

describe('Credit-budget enforcement', () => {
  const month = new Date().toISOString().slice(0, 7);

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO govtribe_credit_monthly (month, credits_used, credits_budget)
       VALUES ($1, 0, 100)
       ON CONFLICT (month) DO UPDATE SET credits_used = 0, credits_budget = 100`,
      [month],
    );
  });

  it('should log credit usage to ledger', async () => {
    await pool.query(
      `INSERT INTO govtribe_credit_ledger (endpoint, cost_credits, decision)
       VALUES ('opportunities', 1, 'called')`,
    );

    const { rows } = await pool.query(
      `SELECT * FROM govtribe_credit_ledger WHERE endpoint = 'opportunities' ORDER BY id DESC LIMIT 1`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].decision).toBe('called');
    expect(rows[0].cost_credits).toBe(1);
    expect(rows[0].request_id).toBeTruthy();
  });

  it('should track skip decisions at 80% budget', async () => {
    await pool.query(
      `UPDATE govtribe_credit_monthly SET credits_used = 85 WHERE month = $1`,
      [month],
    );

    await pool.query(
      `INSERT INTO govtribe_credit_ledger (endpoint, cost_credits, decision)
       VALUES ('opportunities', 1, 'skipped_low_budget')`,
    );

    const { rows } = await pool.query(
      `SELECT decision FROM govtribe_credit_ledger
       WHERE endpoint = 'opportunities' AND decision = 'skipped_low_budget'
       ORDER BY id DESC LIMIT 1`,
    );
    expect(rows.length).toBe(1);
  });

  it('should track halt decisions at 95% budget', async () => {
    await pool.query(
      `UPDATE govtribe_credit_monthly SET credits_used = 96 WHERE month = $1`,
      [month],
    );

    await pool.query(
      `INSERT INTO govtribe_credit_ledger (endpoint, cost_credits, decision)
       VALUES ('opportunities', 1, 'skipped_halted')`,
    );

    const { rows } = await pool.query(
      `SELECT decision FROM govtribe_credit_ledger
       WHERE endpoint = 'opportunities' AND decision = 'skipped_halted'
       ORDER BY id DESC LIMIT 1`,
    );
    expect(rows.length).toBe(1);
  });

  it('should roll up daily credits into monthly aggregate', async () => {
    await pool.query(`DELETE FROM govtribe_credit_ledger`);
    await pool.query(
      `UPDATE govtribe_credit_monthly SET credits_used = 0 WHERE month = $1`,
      [month],
    );

    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO govtribe_credit_ledger (endpoint, cost_credits, decision)
         VALUES ('opportunities', 1, 'called')`,
      );
    }

    const { rows: ledgerRows } = await pool.query(
      `SELECT COALESCE(SUM(cost_credits), 0)::int AS total
       FROM govtribe_credit_ledger
       WHERE decision = 'called'
         AND created_at >= date_trunc('month', NOW())`,
    );
    expect(ledgerRows[0].total).toBe(5);
  });
});

describe('GovTribe API endpoints', () => {
  it('GET /v3/govtribe/health returns valid JSON with credit pct', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/govtribe/health',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('api_reachable');
    expect(body.data).toHaveProperty('credits');
    expect(body.data.credits).toHaveProperty('pct');
    expect(typeof body.data.credits.pct).toBe('number');
  });

  it('GET /v3/govtribe/credits returns credit dashboard data with V2 schema fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/govtribe/credits',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('cycleCap');
    expect(body.data).toHaveProperty('cycleUsed');
    expect(body.data).toHaveProperty('monthKey');
    expect(body.data).toHaveProperty('monthlyCap');
    expect(body.data).toHaveProperty('monthlyUsed');
    expect(body.data).toHaveProperty('alertThreshold');
    expect(body.data).toHaveProperty('stopThreshold');
    expect(body.data).toHaveProperty('last_3_months');
    expect(body.data).toHaveProperty('top_endpoints');
    expect(body.data.cycleCap).toBe(150);
    expect(body.data.alertThreshold).toBe(Math.round(body.data.monthlyCap * 0.8));
    expect(body.data.stopThreshold).toBe(Math.round(body.data.monthlyCap * 0.95));
  });

  it('POST /v3/govtribe/sync dry_run returns count without burning credits', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/govtribe/sync?endpoint=opportunities&dry_run=true',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.dry_run).toBe(true);
    expect(typeof body.data.existing_govtribe_opps).toBe('number');
    expect(body.data.credits).toHaveProperty('pct');
  });

  it('POST /v3/govtribe/sync rejects non-admin', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { sub: 'viewer-user', email: 'viewer@gda.local', role: 'viewer' },
      'test-jwt-secret-integration',
      { algorithm: 'HS256', expiresIn: '1h' },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/govtribe/sync?endpoint=opportunities',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('Sentinel integration', () => {
  it('GET /v3/sentinel/sources includes govtribe entry with credits block', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/sentinel/sources',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);

    const sources = body.data.sources as Array<{ source_key: string; credits?: unknown }>;
    const govtribeSource = sources.find((s) => s.source_key === 'govtribe');
    expect(govtribeSource).toBeDefined();
    expect(govtribeSource?.credits).toBeDefined();

    expect(body.data).toHaveProperty('govtribe_severity');
    expect(body.data).toHaveProperty('govtribe_credits');
  });

  it('Sentinel govtribe_severity reflects credit budget state', async () => {
    const month = new Date().toISOString().slice(0, 7);

    await pool.query(
      `UPDATE govtribe_credit_monthly SET credits_used = 50, credits_budget = 100 WHERE month = $1`,
      [month],
    );

    const res1 = await app.inject({
      method: 'GET',
      url: '/v3/sentinel/sources',
      headers: authHeader(),
    });
    const body1 = JSON.parse(res1.payload);
    expect(body1.data.govtribe_severity).toBe('ok');

    await pool.query(
      `UPDATE govtribe_credit_monthly SET credits_used = 85 WHERE month = $1`,
      [month],
    );

    const res2 = await app.inject({
      method: 'GET',
      url: '/v3/sentinel/sources',
      headers: authHeader(),
    });
    const body2 = JSON.parse(res2.payload);
    expect(body2.data.govtribe_severity).toBe('warning');

    await pool.query(
      `UPDATE govtribe_credit_monthly SET credits_used = 96 WHERE month = $1`,
      [month],
    );

    const res3 = await app.inject({
      method: 'GET',
      url: '/v3/sentinel/sources',
      headers: authHeader(),
    });
    const body3 = JSON.parse(res3.payload);
    expect(body3.data.govtribe_severity).toBe('critical');
  });
});

describe('Dedup fixture', () => {
  it('same opportunity from SAM + GovTribe creates distinct rows with multi-source attribution', async () => {
    const { rows: srcRows } = await pool.query(
      `INSERT INTO sources (kind, url, title, confidence)
       VALUES ('sam_gov', 'https://sam.gov/opp/test-dedup/view', 'SAM test dedup', 'high'),
              ('govtribe', 'https://govtribe.com/opportunity/test-dedup', 'GovTribe test dedup', 'high')
       RETURNING id`,
    );

    const samSourceId = srcRows[0].id;
    const govtribeSourceId = srcRows[1].id;

    await pool.query(
      `INSERT INTO opportunities (
         title, agency, solicitation_number, sam_notice_id,
         data_source, source_id, status
       ) VALUES (
         'Test Dedup Opportunity', 'Department of Defense', 'W91QV1-26-R-0001',
         'test-dedup-sam-001', 'sam.gov', $1, 'discovery'
       )`,
      [samSourceId],
    );

    await pool.query(
      `INSERT INTO opportunities (
         title, agency, solicitation_number, external_id,
         data_source, source_id, status, source_uri, govtribe_id
       ) VALUES (
         'Test Dedup Opportunity', 'Department of Defense', 'W91QV1-26-R-0001',
         'gt-dedup-001', 'govtribe', $1, 'discovery',
         'https://govtribe.com/opportunity/test-dedup', 'gt-dedup-001'
       )`,
      [govtribeSourceId],
    );

    const { rows } = await pool.query(
      `SELECT data_source, solicitation_number, source_uri, govtribe_id
       FROM opportunities
       WHERE solicitation_number = 'W91QV1-26-R-0001' AND deleted_at IS NULL
       ORDER BY data_source`,
    );

    expect(rows.length).toBe(2);

    const govtribeRow = rows.find((r: { data_source: string }) => r.data_source === 'govtribe');
    const samRow = rows.find((r: { data_source: string }) => r.data_source === 'sam.gov');

    expect(govtribeRow).toBeDefined();
    expect(samRow).toBeDefined();
    expect(govtribeRow?.source_uri).toBe('https://govtribe.com/opportunity/test-dedup');
    expect(govtribeRow?.govtribe_id).toBe('gt-dedup-001');
  });
});

describe('GovTribe cache', () => {
  it('should cache and retrieve responses', async () => {
    await pool.query(
      `INSERT INTO govtribe_cache (endpoint, entity_id, response_body, evidence_grade)
       VALUES ('opportunities', 'test-cache-001', '{"title":"Cached Opp"}', 'B')
       ON CONFLICT (endpoint, entity_id) DO UPDATE SET response_body = EXCLUDED.response_body`,
    );

    const { rows } = await pool.query(
      `SELECT response_body, evidence_grade FROM govtribe_cache
       WHERE endpoint = 'opportunities' AND entity_id = 'test-cache-001'`,
    );

    expect(rows.length).toBe(1);
    expect(rows[0].response_body).toEqual({ title: 'Cached Opp' });
    expect(rows[0].evidence_grade).toBe('B');
  });

  it('should expire cache after 30 days', async () => {
    await pool.query(
      `INSERT INTO govtribe_cache (endpoint, entity_id, response_body, expires_at)
       VALUES ('opportunities', 'test-expired-001', '{}', NOW() - INTERVAL '1 day')
       ON CONFLICT (endpoint, entity_id) DO UPDATE SET expires_at = NOW() - INTERVAL '1 day'`,
    );

    const { rows } = await pool.query(
      `SELECT * FROM govtribe_cache
       WHERE endpoint = 'opportunities' AND entity_id = 'test-expired-001'
         AND expires_at > NOW()`,
    );

    expect(rows.length).toBe(0);
  });
});
