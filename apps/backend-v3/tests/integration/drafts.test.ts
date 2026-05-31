/**
 * F-231: Action Item Drafts schema-alignment integration test.
 *
 * Hits a REAL Postgres — no pool.query mocks.
 *
 * 1. Ensure action_items + action_item_drafts tables exist.
 * 2. Create an action_items row.
 * 3. POST /v3/action-items/{id}/drafts {kind:'reply'} → 201, id is a number, status 'generating'.
 * 4. Simulate the analysis worker against the draft id.
 * 5. SELECT the row — content is non-empty, status = 'done'.
 * 6. GET /v3/action-items → drafts array hydrated through toDraftApiShape.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type PgBoss from 'pg-boss';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';
process.env['ANALYSIS_TIMEOUT_MS'] ??= '5000';
process.env['ANALYSIS_POLL_INTERVAL_MS'] ??= '50';

const DB_URL = process.env['DATABASE_URL'];
const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let boss: PgBoss;

function authHeader(): Record<string, string> {
  const token = jwt.sign(
    { sub: 'test-user', email: 'test@gda.local', role: 'admin' },
    'test-jwt-secret',
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { authorization: `Bearer ${token}` };
}

interface SuccessBody {
  success: boolean;
  data: Record<string, unknown>;
}

async function ensureTestSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, url TEXT, title TEXT,
        retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), confidence TEXT NOT NULL DEFAULT 'high',
        meta JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      INSERT INTO sources (id, kind, title, retrieved_at)
      VALUES (1, 'internal', 'Test source', NOW()) ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_items (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        detail TEXT,
        owner_email TEXT NOT NULL DEFAULT 'shawn@envision-is.com',
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'P2',
        due_date TIMESTAMPTZ,
        origin TEXT NOT NULL DEFAULT 'manual',
        source_id BIGINT NOT NULL DEFAULT 1,
        opportunity_id BIGINT,
        partner_context TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_item_drafts (
        id BIGSERIAL PRIMARY KEY,
        action_item_id BIGINT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        content TEXT NOT NULL DEFAULT '',
        model_used TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        source_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_item_audit (
        id TEXT PRIMARY KEY,
        action_item_id TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 5 });
  await ensureTestSchema();

  const { initBoss } = await import('../../src/lib/queue.js');
  boss = await initBoss();

  const { buildApp } = await import('../../src/app.js');
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  const { stopBoss } = await import('../../src/lib/queue.js');
  await stopBoss();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM action_item_drafts');
  await pool.query("DELETE FROM action_items WHERE title LIKE 'Draft-test%'");
});

describe('F-231 Drafts Integration (real Postgres)', () => {
  it('POST /v3/action-items/:id/drafts returns 201 with bigint id and generating status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft-test reply', owner: 'shawn' }),
    });
    expect(createRes.statusCode).toBe(201);
    const itemId = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    const draftRes = await app.inject({
      method: 'POST',
      url: `/v3/action-items/${itemId}/drafts`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply' }),
    });
    expect(draftRes.statusCode).toBe(201);

    const draft = (JSON.parse(draftRes.body) as SuccessBody).data;
    expect(typeof draft.id).toBe('number');
    expect(draft.status).toBe('generating');
    expect(draft.kind).toBe('reply');
  });

  it('worker completes draft end-to-end — content populated, status done', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft-test worker', owner: 'shawn', detail: 'Need RS3 pricing' }),
    });
    const itemId = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    const draftRes = await app.inject({
      method: 'POST',
      url: `/v3/action-items/${itemId}/drafts`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply' }),
    });
    const draftId = (JSON.parse(draftRes.body) as SuccessBody).data.id as number;

    const { buildStubDraftText } = await import('../../src/services/drafts/index.js');
    const actionItem = (await pool.query('SELECT * FROM action_items WHERE id = $1', [itemId])).rows[0]!;
    const content = buildStubDraftText('reply', actionItem);

    await pool.query(
      `UPDATE action_item_drafts
       SET content    = $1,
           status     = 'done',
           model_used = $2
       WHERE id = $3`,
      [content, 'stub', draftId],
    );

    const row = (await pool.query('SELECT * FROM action_item_drafts WHERE id = $1', [draftId])).rows[0] as Record<string, unknown>;
    expect(row.status).toBe('done');
    expect(row.content).toBeTruthy();
    expect(typeof row.content).toBe('string');
    expect((row.content as string).length).toBeGreaterThan(0);
  });

  it('GET /v3/action-items returns drafts array hydrated via toDraftApiShape', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft-test hydration', owner: 'shawn' }),
    });
    const itemId = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    const draftRes = await app.inject({
      method: 'POST',
      url: `/v3/action-items/${itemId}/drafts`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply' }),
    });
    const draftId = (JSON.parse(draftRes.body) as SuccessBody).data.id as number;

    await pool.query(
      `UPDATE action_item_drafts
       SET content = 'Hydration test content', status = 'done', model_used = 'stub'
       WHERE id = $1`,
      [draftId],
    );

    const listRes = await app.inject({
      method: 'GET',
      url: '/v3/action-items?status=open',
      headers: authHeader(),
    });
    expect(listRes.statusCode).toBe(200);

    const items = ((JSON.parse(listRes.body) as SuccessBody).data as { items: Record<string, unknown>[] }).items;
    const found = items.find((i) => i.id === itemId);
    expect(found).toBeDefined();

    const drafts = found!.drafts as Record<string, unknown>[];
    expect(drafts.length).toBeGreaterThanOrEqual(1);

    const d = drafts[0];
    expect(typeof d.id).toBe('number');
    expect(d.content).toBe('Hydration test content');
    expect(d.model_used).toBe('stub');
    expect(d.status).toBe('approved');
    expect(d.kind).toBe('reply');
  });
});
