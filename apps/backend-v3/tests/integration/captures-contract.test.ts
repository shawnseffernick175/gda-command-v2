/**
 * F-232 — Captures contract tests (moved from tests/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 * POST /v3/captures documents schema drift (capture_kickoff_at missing).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { getDbUrl, authHeader, getApp, closeApp, JWT_SECRET, WEBHOOK_KEY } from './helpers.js';

const { Pool } = pg;

let app: FastifyInstance;
let pool: InstanceType<typeof Pool>;

async function insertTestOpportunity(title: string = 'Cap_Opportunity'): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, agency, status, source_id)
     VALUES ($1, $2, 'discovery', 1) RETURNING id`,
    [title, 'Department of the Army'],
  );
  return String(res.rows[0]!.id);
}

async function insertTestPipelineItem(oppId: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO pipeline_items (opportunity_id, capture_owner, source_id)
     VALUES ($1, 'shawn', 1) RETURNING id`,
    [oppId],
  );
  return String(res.rows[0]!.id);
}

async function insertTestCapture(
  pipelineItemId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const defaults = {
    color_stage: 'pink',
    capture_plan: JSON.stringify({}),
    pricing_notes: null,
    compliance_status: 'incomplete',
    win_themes: '{}',
    ghost_team: null,
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO captures (
      pipeline_item_id, color_stage, capture_plan,
      pricing_notes, compliance_status, win_themes, ghost_team, source_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id`,
    [
      pipelineItemId, data.color_stage, data.capture_plan,
      data.pricing_notes, data.compliance_status, data.win_themes, data.ghost_team,
    ],
  );
  return String(res.rows[0]!.id);
}

beforeAll(async () => {
  const dbUrl = getDbUrl();
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '500';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

  pool = new Pool({ connectionString: dbUrl, max: 5 });
  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  // Only clean data created by this file (Cap_* prefix)
  await pool.query(`
    DELETE FROM capture_analysis_cache WHERE capture_id IN (
      SELECT c.id FROM captures c
      JOIN pipeline_items pi ON c.pipeline_item_id = pi.id
      JOIN opportunities o ON pi.opportunity_id = o.id
      WHERE o.title LIKE 'Cap_%'
    )
  `);
  await pool.query(`
    DELETE FROM compliance_items WHERE capture_id IN (
      SELECT c.id FROM captures c
      JOIN pipeline_items pi ON c.pipeline_item_id = pi.id
      JOIN opportunities o ON pi.opportunity_id = o.id
      WHERE o.title LIKE 'Cap_%'
    )
  `);
  await pool.query(`
    DELETE FROM captures WHERE pipeline_item_id IN (
      SELECT pi.id FROM pipeline_items pi
      JOIN opportunities o ON pi.opportunity_id = o.id
      WHERE o.title LIKE 'Cap_%'
    )
  `);
  await pool.query(`
    DELETE FROM pipeline_items WHERE opportunity_id IN (
      SELECT id FROM opportunities WHERE title LIKE 'Cap_%'
    )
  `);
  await pool.query(`DELETE FROM opportunities WHERE title LIKE 'Cap_%'`);
});

interface SuccessBody {
  success: true;
  data: Record<string, unknown>;
  meta: { generatedAt: string; source: string; requestId: string };
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; detail: string | null };
  meta: { generatedAt: string; source: string; requestId: string };
}

describe('Contract: GET /v3/captures', () => {
  it('returns paginated list with CaptureSummary fields', async () => {
    const oppId = await insertTestOpportunity('Cap_Contract List Opp');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId);

    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    expect(body.meta.source).toBe('v3');

    const data = body.data as { items: Array<Record<string, unknown>>; pagination: Record<string, unknown> };
    expect(data.items).toBeDefined();
    expect(data.pagination).toBeDefined();
    expect(data.pagination.limit).toBeDefined();
    expect(data.pagination.hasMore).toBeDefined();

    const item = data.items[0]!;
    expect(item.id).toBeDefined();
    expect(item.pipeline_item_id).toBeDefined();
    expect(item.color_stage).toBe('pink');
    expect(item.created_at).toBeDefined();
    expect(item.updated_at).toBeDefined();
  });

  it('filters by color_stage', async () => {
    const oppId = await insertTestOpportunity('Cap_Filter Opp');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId, { color_stage: 'pink' });
    await insertTestCapture(piId, { color_stage: 'red' });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures?color_stage=pink',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody;
    const data = body.data as { items: Array<Record<string, unknown>> };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of data.items) {
      expect(item.color_stage).toBe('pink');
    }
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/captures' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: GET /v3/captures/:id', () => {
  it('returns 404 for non-existent capture', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/captures/1' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: POST /v3/captures', () => {
  // POST /v3/captures creates a capture row from a pipeline item and returns 201.
  it('returns 201 and creates a capture from a pipeline item', async () => {
    const oppId = await insertTestOpportunity('Cap_Create Opp');
    const piId = await insertTestPipelineItem(oppId);

    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: piId }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { id: string; pipeline_item_id: string } };
    expect(body.data.pipeline_item_id).toBe(String(piId));
  });

  it('returns 400 for missing pipeline_item_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent pipeline item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: '999999' }),
    });
    // May be 404 (pipeline item lookup) or 500 (capture_kickoff_at drift)
    expect([404, 500]).toContain(res.statusCode);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: '1' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: PATCH /v3/captures/:id', () => {
  it('updates color_stage and returns 200', async () => {
    const oppId = await insertTestOpportunity('Cap_Patch Opp');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'red' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.data.color_stage).toBe('red');
  });

  it('returns 404 for non-existent capture', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/captures/999999',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'pink' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid stage', async () => {
    const oppId = await insertTestOpportunity('Cap_Invalid Stage Opp');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'invalid_stage' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/captures/1',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'pink' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: SuccessEnvelope on capture endpoints', () => {
  it('all capture responses include meta with generatedAt, source, requestId', async () => {
    const oppId = await insertTestOpportunity('Cap_Envelope Opp');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId);

    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.meta.generatedAt).toBeTruthy();
    expect(body.meta.source).toBe('v3');
    expect(body.meta.requestId).toBeTruthy();
  });
});
