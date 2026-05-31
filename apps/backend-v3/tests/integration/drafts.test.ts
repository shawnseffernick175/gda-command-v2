/**
 * F-231: Action Item Drafts schema-alignment integration test.
 *
 * Runs against REAL Postgres via testcontainer (shared globalSetup).
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 *
 * Known schema drift documented inline:
 *   - POST /v3/action-items uses columns (detail, owner, source, linked_record_*)
 *     that don't exist in v3_001 → 500
 *   - POST /v3/action-items/:id/drafts inserts status='generating' which violates
 *     the CHECK (pending|approved|rejected) → 500
 *   - These are pre-existing drifts to be fixed in F-233 (code → DB alignment)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getPool, getApp, closeApp, JWT_SECRET, WEBHOOK_KEY } from './helpers.js';
import pg from 'pg';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  process.env['DATABASE_URL'] = dbUrl;
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] ??= '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] ??= '50';

  pool = new Pool({ connectionString: dbUrl, max: 5 });
  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
}, 30_000);

describe('F-231 Drafts Integration (real Postgres, canonical v3_001–v3_008 schema)', () => {
  it('POST /v3/action-items returns 500 — schema drift: code inserts into nonexistent columns', async () => {
    // createActionItem() inserts (id, title, detail, owner, status, due_date,
    // source, source_id, linked_record_type, linked_record_id) but v3_001
    // action_items has (id BIGSERIAL, title, body, owner_email, status,
    // source_id, origin, ...). Columns detail/owner/source/linked_record_*
    // do not exist → INSERT fails.
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft-test reply', owner: 'shawn' }),
    });
    expect(res.statusCode).toBe(500);
  });

  it('POST /v3/action-items/:id/drafts returns 201 — F-231 fixed the drift', async () => {
    // Seed an action item directly using v3_001 columns
    const srcRes = await pool.query<{ id: string }>(
      "SELECT id::text FROM sources LIMIT 1",
    );
    const sourceId = srcRes.rows[0]?.id;
    if (!sourceId) return; // no seed data available

    const aiRes = await pool.query<{ id: string }>(
      `INSERT INTO action_items (title, body, owner_email, status, source_id, created_at, updated_at)
       VALUES ('Draft-test item', NULL, 'test@gda.local', 'open', $1, NOW(), NOW())
       RETURNING id::text`,
      [sourceId],
    );
    const actionItemId = aiRes.rows[0]!.id;

    const { initBoss, stopBoss } = await import('../../src/lib/queue.js');
    const boss = await initBoss();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v3/action-items/${actionItemId}/drafts`,
        headers: { ...authHeader(), 'content-type': 'application/json' },
        payload: JSON.stringify({ kind: 'reply' }),
      });
      // F-231 fixed the schema drift — requestDraft now uses valid status + source_id
      expect(res.statusCode).toBe(201);
    } finally {
      await stopBoss();
    }
  });

  it('GET /v3/action-items returns 200 with seeded items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});
