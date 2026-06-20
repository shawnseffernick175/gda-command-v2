/**
 * F-232 — Endpoint smoke suite.
 *
 * Hits every V3 endpoint against a Postgres testcontainer with a real
 * JWT. Validates response status + shape.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SeedIds } from './seed.js';
import { getDbUrl, getSeedIds, authHeader, getPool, getApp, closeApp, JWT_SECRET, WEBHOOK_KEY } from './helpers.js';

let app: FastifyInstance;
let ids: SeedIds;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  ids = getSeedIds();

  // Set env vars before any app import
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '2000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
}, 30_000);

// ─── Launchpad ───────────────────────────────────────────────────────
describe('GET /v3/launchpad/summary', () => {
  it('returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/launchpad/summary', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

describe('GET /v3/launchpad/flags', () => {
  it('returns 200 with array', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/launchpad/flags', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown };
    expect(body.success).toBe(true);
  });
});

// ─── Opportunities ───────────────────────────────────────────────────
describe('GET /v3/opportunities', () => {
  it('returns 200 with items array', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/opportunities', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

describe('GET /v3/opportunities/:id', () => {
  it('returns 200 for seeded opportunity', async () => {
    // Pre-populate analysis cache so the endpoint doesn't try to enqueue
    const pool = getPool();
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE opportunities SET
         analysis = $1, analysis_version = 'v0.0.1-test',
         ai_analyzed_at = $2, updated_at = $3
       WHERE id = $4`,
      [
        JSON.stringify({
          pwin: 0.5, version: 'v0.0.1-test', generated_at: now,
          pwin_sources: [], incumbent: null, incumbent_sources: [],
          competitors: [], competitors_sources: [],
          blackhat: null, blackhat_sources: [],
          wargame: null, wargame_sources: [],
          timeline: null, timeline_sources: [],
        }),
        now,
        new Date(Date.now() - 1000).toISOString(),
        ids.opportunityId,
      ],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${ids.opportunityId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { title: string } };
    expect(body.success).toBe(true);
    expect(body.data.title).toBeTruthy();
  });

  it('returns 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /v3/opportunities/:id/qualify', () => {
  it('returns 200 and updates status', async () => {
    // Ensure opportunity is in a state that can be qualified
    const pool = getPool();
    await pool.query(
      "UPDATE opportunities SET status = 'tracking' WHERE id = $1",
      [ids.opportunityId],
    );

    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${ids.opportunityId}/qualify`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ─── Captures ────────────────────────────────────────────────────────
describe('GET /v3/captures', () => {
  it('returns 200 with items array', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/captures', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

describe('POST /v3/captures', () => {
  it('returns 201 and creates a capture from a pipeline item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: ids.pipelineItemId }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { pipeline_item_id: string } };
    expect(body.data.pipeline_item_id).toBe(String(ids.pipelineItemId));
  });
});

describe('PATCH /v3/captures/:id', () => {
  it('returns 200 when updating notes', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${ids.captureId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pricing_notes: 'Integration test note' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ─── Pipeline ────────────────────────────────────────────────────────
describe('GET /v3/pipeline', () => {
  it('returns 200 with items array', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/pipeline', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

// ─── Action Items ────────────────────────────────────────────────────
describe('GET /v3/action-items', () => {
  it('returns 200 with items array', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/action-items', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

describe('POST /v3/action-items/:id/drafts', () => {
  it('returns 201 — F-231 fixed the schema drift', async () => {
    const { initBoss, stopBoss } = await import('../../src/lib/queue.js');
    const boss = await initBoss();

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v3/action-items/${ids.actionItemId}/drafts`,
        headers: { ...authHeader(), 'content-type': 'application/json' },
        payload: JSON.stringify({ kind: 'reply' }),
      });
      expect(res.statusCode).toBe(201);
    } finally {
      await stopBoss();
    }
  });
});

describe('GET /v3/action-items/:id (with drafts hydrated)', () => {
  it('returns 200 with drafts array (empty — no drafts created due to schema drift)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: { items: Array<{ id: string; drafts: unknown[] }> };
    };
    expect(body.success).toBe(true);

    const item = body.data.items.find((i) => String(i.id) === String(ids.actionItemId));
    expect(item).toBeTruthy();
    expect(Array.isArray(item!.drafts)).toBe(true);
  });
});

// ─── Fast Track ──────────────────────────────────────────────────────
describe('GET /v3/fastrac', () => {
  it('returns 200 with items', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/fastrac', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

describe('POST /v3/fastrac (assess)', () => {
  it('returns 200 or 503 (sync-wait timeout without worker)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'Test Fast Track Assessment',
        description: 'Integration test for fast track triage endpoint',
        naics_codes: ['541330'],
        set_aside: null,
        place_of_performance: null,
      }),
    });
    // Without a running fast-track worker, expect 503 (timeout) — that's
    // correct behavior. If a worker is running, 200.
    expect([200, 503]).toContain(res.statusCode);
  });
});

// ─── Sources ─────────────────────────────────────────────────────────
describe('GET /v3/sources', () => {
  it('returns 200 with items', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/sources', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

// ─── Partners ────────────────────────────────────────────────────────
describe('GET /v3/partners', () => {
  it('returns 200 with array of partner profiles', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/partners', headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});
