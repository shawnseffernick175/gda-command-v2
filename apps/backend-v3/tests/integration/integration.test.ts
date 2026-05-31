/**
 * F-234: Core integration tests (migrated from tests/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import type PgBoss from 'pg-boss';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp, WEBHOOK_KEY } from './helpers.js';

const { Pool } = pg;

const NO_VALUE = undefined;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let boss: PgBoss;

async function insertTestOpportunity(overrides: Record<string, unknown> = {}): Promise<string> {
  const defaults = {
    title: 'Test Opportunity',
    status: 'discovery',
    source_id: 1,
    analysis: NO_VALUE,
    analysis_version: NO_VALUE,
    ai_analyzed_at: NO_VALUE,
    updated_at: new Date().toISOString(),
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, status, source_id, analysis, analysis_version, ai_analyzed_at, updated_at, agency, naics, set_aside, value_min, value_max, response_due_at, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      data.title, data.status, data.source_id,
      data.analysis ? JSON.stringify(data.analysis) : null,
      data.analysis_version, data.ai_analyzed_at, data.updated_at,
      data.agency ?? null, data.naics ?? null, data.set_aside ?? null,
      data.value_min ?? null, data.value_max ?? null,
      data.response_due_at ?? null, data.description ?? null,
    ],
  );
  return String(res.rows[0]!.id);
}

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });

  // getApp() must run before initBoss() so that process.env['JWT_SECRET']
  // is set before queue.ts imports config (config reads env at import time).
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
  // Exclude the seeded 'Test Opportunity — Integration' to avoid breaking
  // other test files that rely on seed data.
  const filter = `title LIKE 'Test %' AND title != 'Test Opportunity — Integration'`;
  await pool.query(`
    DELETE FROM captures WHERE pipeline_item_id IN (
      SELECT id FROM pipeline_items WHERE opportunity_id IN (
        SELECT id FROM opportunities WHERE ${filter}
      )
    )
  `);
  await pool.query(`DELETE FROM pipeline_items WHERE opportunity_id IN (SELECT id FROM opportunities WHERE ${filter})`);
  await pool.query(`DELETE FROM opportunities WHERE ${filter}`);
});

describe('Integration: detail endpoint with fresh cache', () => {
  it('returns 200 when analysis cache is fresh', async () => {
    const now = new Date().toISOString();
    const id = await insertTestOpportunity({
      title: 'Test Fresh Cache',
      analysis: {
        pwin: 0.5, version: 'v0.0.1-test', generated_at: now,
        pwin_sources: [], incumbent: null, incumbent_sources: [],
        competitors: [], competitors_sources: [],
        blackhat: null, blackhat_sources: [],
        wargame: null, wargame_sources: [],
        timeline: null, timeline_sources: [],
      },
      analysis_version: 'v0.0.1-test',
      ai_analyzed_at: now,
      updated_at: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { analysis: Record<string, unknown> } };
    expect(body.success).toBe(true);
    expect(body.data.analysis).toBeDefined();
    expect(body.data.analysis).not.toBeNull();
    expect(typeof body.data.analysis.pwin).toBe('number');
    expect(body.data.analysis.version).toBe('v0.0.1-test');
    expect(body.data.analysis.generated_at).toBeTruthy();
  });

  it('detail response includes R1 source siblings', async () => {
    const now = new Date().toISOString();
    const id = await insertTestOpportunity({
      title: 'Test R1 Sources',
      analysis: {
        pwin: 0.6, version: 'v0.0.1-test', generated_at: now,
        pwin_sources: [{ kind: 'internal', title: 'test', url: '/test', retrieved_at: now }],
        incumbent: 'CACI', incumbent_sources: [],
        competitors: [], competitors_sources: [],
        blackhat: null, blackhat_sources: [],
        wargame: null, wargame_sources: [],
        timeline: null, timeline_sources: [],
      },
      analysis_version: 'v0.0.1-test',
      ai_analyzed_at: now,
      updated_at: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: {
        title_sources: unknown[];
        agency_sources: unknown[];
        analysis: { pwin_sources: unknown[] };
      };
    };
    expect(Array.isArray(body.data.title_sources)).toBe(true);
    expect(Array.isArray(body.data.agency_sources)).toBe(true);
    expect(Array.isArray(body.data.analysis.pwin_sources)).toBe(true);
  });
});

describe('Integration: detail endpoint pre-warm completes within timeout', () => {
  it('returns 200 after analysis job completes', async () => {
    const id = await insertTestOpportunity({
      title: 'Test PreWarm',
      agency: 'Department of the Army',
      naics: '541330',
    });

    const { startWorker } = await import('../../src/workers/analysis.js');
    const workerBoss = await startWorker();

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/opportunities/${id}`,
        headers: authHeader(),
      });

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body) as {
          success: boolean;
          data: { analysis: { pwin: number; version: string; generated_at: string } };
        };
        expect(body.success).toBe(true);
        expect(body.data.analysis).not.toBeNull();
        expect(typeof body.data.analysis.pwin).toBe('number');
        expect(body.data.analysis.version).toBe('v0.0.1-test');
        expect(body.data.analysis.generated_at).toBeTruthy();
      } else {
        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
        expect(body.error.code).toBe('ANALYSIS_TIMEOUT');
      }
    } finally {
      await workerBoss.stop({ graceful: true, timeout: 5000 });
    }
  });
});

describe('Integration: detail endpoint ANALYSIS_TIMEOUT', () => {
  it('returns 503 when no worker processes the job', async () => {
    process.env['ANALYSIS_TIMEOUT_MS'] = '500';
    process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

    const id = await insertTestOpportunity({
      title: 'Test Timeout',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string; detail: string | null } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ANALYSIS_TIMEOUT');
    expect(body.error.detail).toContain('estimated_seconds');
  });
});

describe('Integration: pre-warm triggers', () => {
  it('POST /v3/opportunities enqueues analysis on create', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/opportunities',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'Test PreWarm Create',
        source: 'manual',
        agency: 'Department of the Army',
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { id: string } };
    expect(body.data.id).toBeTruthy();

    await pool.query("DELETE FROM opportunities WHERE title = 'Test PreWarm Create'");
  });

  it('PATCH with analysis-affecting field triggers pre-warm', async () => {
    const id = await insertTestOpportunity({ title: 'Test PreWarm Patch' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ agency: 'U.S. Army TACOM' }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('PATCH with non-analysis field does NOT trigger pre-warm (no error)', async () => {
    const id = await insertTestOpportunity({ title: 'Test NonAnalysis Patch' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ psc: '541330' }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('SAM webhook enqueues analysis pre-warm', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      headers: {
        'content-type': 'application/json',
        'x-gda-key': WEBHOOK_KEY,
      },
      payload: JSON.stringify({
        title: 'Test SAM Webhook Opp',
        sam_notice_id: 'SAM-TEST-001',
        agency: 'Department of the Army',
        naics: '541330',
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { upserted: number } };
    expect(body.data.upserted).toBe(1);

    await pool.query("DELETE FROM opportunities WHERE title = 'Test SAM Webhook Opp'");
  });
});

describe('Integration: filter combinations', () => {
  it('filters by status', async () => {
    await insertTestOpportunity({ title: 'Test Filter Status', status: 'discovery' });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities?status=discovery',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { items: Array<{ status: string }> } };
    for (const item of body.data.items) {
      expect(item.status).toBe('discovery');
    }
  });

  it('filters by agency substring', async () => {
    await insertTestOpportunity({ title: 'Test Filter Agency', agency: 'Department of the Army' });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities?agency=Army',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { items: Array<{ agency: string }> } };
    for (const item of body.data.items) {
      expect(item.agency?.toLowerCase()).toContain('army');
    }
  });

  it('filters by value range', async () => {
    await insertTestOpportunity({
      title: 'Test Filter Value',
      value_min: 5000000,
      value_max: 15000000,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities?min_value=1000000&max_value=20000000',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
  });

  it('cursor pagination is stable', async () => {
    for (let i = 0; i < 5; i++) {
      await insertTestOpportunity({ title: `Test Pagination ${i}` });
    }

    const res1 = await app.inject({
      method: 'GET',
      url: '/v3/opportunities?limit=2',
      headers: authHeader(),
    });

    const body1 = JSON.parse(res1.body) as {
      data: {
        items: Array<{ id: string }>;
        pagination: { cursor: string | null; hasMore: boolean };
      };
    };

    if (body1.data.pagination.hasMore && body1.data.pagination.cursor) {
      const res2 = await app.inject({
        method: 'GET',
        url: `/v3/opportunities?limit=2&cursor=${body1.data.pagination.cursor}`,
        headers: authHeader(),
      });

      const body2 = JSON.parse(res2.body) as {
        data: { items: Array<{ id: string }> };
      };

      const ids1 = new Set(body1.data.items.map((i) => i.id));
      for (const item of body2.data.items) {
        expect(ids1.has(item.id)).toBe(false);
      }
    }
  });
});
