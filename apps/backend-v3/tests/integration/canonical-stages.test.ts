/**
 * Integration tests for canonical pipeline stage taxonomy (PR-A1).
 *
 * Validates:
 * - PATCH stage writes pipeline_items with canonical keys
 * - List filter by stage returns correct results
 * - Unstaged opps default to 'interest' in detail and list
 * - POST /qualify writes pipeline_items at 'qualify'
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import type PgBoss from 'pg-boss';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let boss: PgBoss;

async function insertTestOpportunity(overrides: Record<string, unknown> = {}): Promise<string> {
  const defaults = {
    title: 'Test Canonical Stage',
    status: 'discovery',
    agency: 'Test Agency',
    naics: '541330',
    set_aside: 'SDB',
    source_id: 1,
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, status, agency, naics, set_aside, source_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [data.title, data.status, data.agency, data.naics, data.set_aside, data.source_id],
  );
  return String(res.rows[0]!.id);
}

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });
  app = await getApp();

  const { initBoss } = await import('../../src/lib/queue.js');
  boss = await initBoss();
}, 120_000);

afterAll(async () => {
  const { stopBoss } = await import('../../src/lib/queue.js');
  await stopBoss();
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  await pool.query("SET LOCAL gda.allow_pipeline_delete = 'true'");
  await pool.query("DELETE FROM pipeline_items WHERE opportunity_id IN (SELECT id FROM opportunities WHERE title LIKE 'Test Canonical%')");
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'Test Canonical%'");
});

describe('Canonical pipeline stages: PATCH + filter', () => {
  it('PATCH stage on an unqualified opp is REJECTED (409) and creates no pipeline card', async () => {
    const oppId = await insertTestOpportunity();

    // Attempt to set a pipeline stage before qualifying -> must be refused.
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${oppId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ stage: 'qualify' }),
    });
    expect(patchRes.statusCode).toBe(409);
    const patchBody = JSON.parse(patchRes.body) as { error: { code: string } };
    expect(patchBody.error.code).toBe('CONFLICT');

    // No pipeline card should have been created.
    const piRes = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = $1',
      [oppId],
    );
    expect(piRes.rows.length).toBe(0);
  });

  it('qualify creates the pipeline card; THEN PATCH stage moves it between stages', async () => {
    const oppId = await insertTestOpportunity();

    // Qualify -> the only path that admits an opp into the pipeline.
    const qualRes = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${oppId}/qualify`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ qualified_by: 'tester' }),
    });
    expect(qualRes.statusCode).toBe(200);

    const afterQual = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = $1',
      [oppId],
    );
    expect(afterQual.rows.length).toBe(1);
    expect(afterQual.rows[0]!.stage).toBe('qualify');

    // Now a stage PATCH should MOVE the existing card, not create a second one.
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${oppId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ stage: 'pursue' }),
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body) as { data: { pipeline_stage: string } };
    expect(patchBody.data.pipeline_stage).toBe('pursue');

    const piRes = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = $1',
      [oppId],
    );
    expect(piRes.rows.length).toBe(1);
    expect(piRes.rows[0]!.stage).toBe('pursue');

    // GET list filtered by stage=pursue should include this opp
    const listRes = await app.inject({
      method: 'GET',
      url: `/v3/opportunities?stage=pursue&relevant_only=false`,
      headers: authHeader(),
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      data: { items: Array<{ id: number | string; pipeline_stage: string }> };
    };
    const found = listBody.data.items.find((i) => String(i.id) === oppId);
    expect(found).toBeTruthy();
    expect(found!.pipeline_stage).toBe('pursue');
  });

  it('unstaged opp appears in interest list and has pipeline_stage=interest in detail', async () => {
    const oppId = await insertTestOpportunity();

    // GET list filtered by stage=interest should include this unstaged opp
    const listRes = await app.inject({
      method: 'GET',
      url: `/v3/opportunities?stage=interest&relevant_only=false`,
      headers: authHeader(),
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      data: { items: Array<{ id: number | string; pipeline_stage: string }> };
    };
    const found = listBody.data.items.find((i) => String(i.id) === oppId);
    expect(found).toBeTruthy();
    expect(found!.pipeline_stage).toBe('interest');
  });

  it('unstaged opp does NOT appear when filtering by qualify', async () => {
    const oppId = await insertTestOpportunity();

    const listRes = await app.inject({
      method: 'GET',
      url: `/v3/opportunities?stage=qualify&relevant_only=false`,
      headers: authHeader(),
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      data: { items: Array<{ id: number | string }> };
    };
    const found = listBody.data.items.find((i) => String(i.id) === oppId);
    expect(found).toBeFalsy();
  });

  it('PATCH accepts display labels (e.g. "Pursue") and normalizes to DB key', async () => {
    const oppId = await insertTestOpportunity();

    // Admit into the pipeline first (qualify is the only entry path).
    const qualRes = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${oppId}/qualify`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ qualified_by: 'tester' }),
    });
    expect(qualRes.statusCode).toBe(200);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${oppId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ stage: 'Pursue' }),
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body) as { data: { pipeline_stage: string } };
    expect(patchBody.data.pipeline_stage).toBe('pursue');
  });

  it('PATCH rejects unknown stage values', async () => {
    const oppId = await insertTestOpportunity();

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${oppId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ stage: 'bogus_stage' }),
    });
    expect(patchRes.statusCode).toBe(400);
  });
});

describe('Canonical pipeline stages: /qualify endpoint', () => {
  it('POST /qualify writes pipeline_items at qualify', async () => {
    const oppId = await insertTestOpportunity({ status: 'discovery' });

    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${oppId}/qualify`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ qualified_by: 'test-user' }),
    });
    expect(res.statusCode).toBe(200);

    // Verify pipeline_items row exists at 'qualify'
    const piRes = await pool.query<{ stage: string }>(
      'SELECT stage FROM pipeline_items WHERE opportunity_id = $1',
      [oppId],
    );
    expect(piRes.rows.length).toBeGreaterThan(0);
    expect(piRes.rows[0]!.stage).toBe('qualify');
  });
});
