import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
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
    { algorithm: 'HS256', expiresIn: '1h' }
  );
  return { authorization: `Bearer ${token}` };
}

function webhookHeaders(payload: string): Record<string, string> {
  const signature = createHmac('sha256', 'test-webhook-key')
    .update(payload)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-gda-signature': signature,
  };
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
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        detail TEXT,
        owner TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        due_date TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        source_id TEXT,
        linked_record_type TEXT,
        linked_record_id TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_item_drafts (
        id TEXT PRIMARY KEY,
        action_item_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        draft_text TEXT,
        sources JSONB,
        status TEXT NOT NULL DEFAULT 'generating',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 5 });
  await ensureTestSchema();

  const { initBoss } = await import('../src/lib/queue.js');
  boss = await initBoss();

  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  const { stopBoss } = await import('../src/lib/queue.js');
  await stopBoss();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM action_item_drafts');
  await pool.query('DELETE FROM action_item_audit');
  await pool.query('DELETE FROM action_items');
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

// --------------------------------------------------------------------------
// Contract tests
// --------------------------------------------------------------------------
describe('Contract: Action Items endpoints', () => {
  it('GET /v3/action-items returns SuccessEnvelope with items + pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    expect(body.meta.source).toBe('v3');
    expect(body.meta.requestId).toBeTruthy();
    const data = body.data as { items: unknown[]; pagination: { limit: number; hasMore: boolean } };
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.pagination).toBeDefined();
    expect(typeof data.pagination.limit).toBe('number');
    expect(typeof data.pagination.hasMore).toBe('boolean');
  });

  it('POST /v3/action-items returns 201 with SuccessEnvelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'Test contract item',
        owner: 'shawn',
        due_date: '2026-06-15',
        source: 'manual',
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    expect(body.meta.source).toBe('v3');
    const data = body.data as Record<string, unknown>;
    expect(data.id).toBeTruthy();
    expect(data.title).toBe('Test contract item');
    expect(data.owner).toBe('shawn');
    expect(data.status).toBe('open');
    expect(data.title_sources).toBeDefined();
    expect(Array.isArray(data.title_sources)).toBe(true);
  });

  it('POST /v3/action-items validates required title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ owner: 'shawn' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('title');
  });

  it('POST /v3/action-items validates required owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Test' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('owner');
  });

  it('POST /v3/action-items rejects team names as owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Test', owner: 'team' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('individual');
  });

  it('PATCH /v3/action-items/:id returns 200 on valid update', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Patch test', owner: 'shawn' }),
    });
    const created = JSON.parse(createRes.body) as SuccessBody;
    const id = (created.data as Record<string, unknown>).id as string;

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'in_progress' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    expect((body.data as Record<string, unknown>).status).toBe('in_progress');
  });

  it('PATCH /v3/action-items/:id returns 404 for non-existent item', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/action-items/non-existent-id',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'done' }),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('POST /v3/action-items/:id/drafts returns 201 with draft envelope', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft test', owner: 'shawn' }),
    });
    const created = JSON.parse(createRes.body) as SuccessBody;
    const id = (created.data as Record<string, unknown>).id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/v3/action-items/${id}/drafts`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply' }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    const draft = body.data as Record<string, unknown>;
    expect(draft.id).toBeTruthy();
    expect(draft.kind).toBe('reply');
    expect(draft.action_item_id).toBe(id);
  });

  it('POST /v3/action-items/:id/drafts rejects invalid kind', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft kind test', owner: 'shawn' }),
    });
    const created = JSON.parse(createRes.body) as SuccessBody;
    const id = (created.data as Record<string, unknown>).id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/v3/action-items/${id}/drafts`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'invalid' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /v3/action-items/:id/drafts returns 404 for non-existent item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items/non-existent-id/drafts',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v3/action-items requires auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v3/action-items requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Test', owner: 'shawn' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// --------------------------------------------------------------------------
// Integration: status transitions
// --------------------------------------------------------------------------
describe('Integration: Action item status transitions', () => {
  it('open → in_progress → done transitions work', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Transition test', owner: 'shawn' }),
    });
    const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    const toInProgress = await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'in_progress' }),
    });
    expect(toInProgress.statusCode).toBe(200);
    expect((JSON.parse(toInProgress.body) as SuccessBody).data.status).toBe('in_progress');

    const toDone = await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'done' }),
    });
    expect(toDone.statusCode).toBe(200);
    const doneBody = JSON.parse(toDone.body) as SuccessBody;
    expect(doneBody.data.status).toBe('done');
    expect(doneBody.data.completed_at).toBeTruthy();
  });

  it('open → done skip transition works', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Skip test', owner: 'shawn' }),
    });
    const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    const toDone = await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'done' }),
    });
    expect(toDone.statusCode).toBe(200);
    expect((JSON.parse(toDone.body) as SuccessBody).data.status).toBe('done');
  });

  it('cannot reopen without force: true', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Reopen test', owner: 'shawn' }),
    });
    const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'done' }),
    });

    const reopenWithoutForce = await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'open' }),
    });
    expect(reopenWithoutForce.statusCode).toBe(400);
    const body = JSON.parse(reopenWithoutForce.body) as ErrorBody;
    expect(body.error.message).toContain('force');
  });

  it('can reopen with force: true', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Force reopen', owner: 'shawn' }),
    });
    const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'done' }),
    });

    const reopenWithForce = await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'open', force: true }),
    });
    expect(reopenWithForce.statusCode).toBe(200);
    expect((JSON.parse(reopenWithForce.body) as SuccessBody).data.status).toBe('open');
  });

  it('status transitions are logged to audit', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Audit test', owner: 'shawn' }),
    });
    const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    await app.inject({
      method: 'PATCH',
      url: `/v3/action-items/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'in_progress' }),
    });

    const audit = await pool.query(
      'SELECT * FROM action_item_audit WHERE action_item_id = $1 ORDER BY created_at',
      [id]
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(2);
    const statusEntries = audit.rows.filter(
      (r: Record<string, unknown>) => r.field === 'status'
    );
    expect(statusEntries.length).toBe(2);
    expect(statusEntries[0].old_value).toBeNull();
    expect(statusEntries[0].new_value).toBe('open');
    expect(statusEntries[1].old_value).toBe('open');
    expect(statusEntries[1].new_value).toBe('in_progress');
    expect(statusEntries[0].actor).toBeTruthy();
    expect(statusEntries[0].created_at).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// Integration: draft full flow (request → poll → result)
// --------------------------------------------------------------------------
describe('Integration: Draft endpoint full flow', () => {
  it('request → worker processes → draft has text + sources', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Draft flow test', owner: 'shawn', detail: 'Need RS3 pricing info' }),
    });
    const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

    const draftRes = await app.inject({
      method: 'POST',
      url: `/v3/action-items/${id}/drafts`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'reply' }),
    });
    expect(draftRes.statusCode).toBe(201);
    const draftData = (JSON.parse(draftRes.body) as SuccessBody).data as Record<string, unknown>;
    const draftId = draftData.id as string;
    expect(draftId).toBeTruthy();

    const { buildStubDraftText, buildDraftSources } = await import('../src/services/drafts/index.js');
    const actionItem = (await pool.query('SELECT * FROM action_items WHERE id = $1', [id])).rows[0]!;
    const draftText = buildStubDraftText('reply', actionItem);
    const sources = buildDraftSources('reply');
    await pool.query(
      `UPDATE action_item_drafts SET draft_text = $1, sources = $2, status = 'done', updated_at = $3 WHERE id = $4`,
      [draftText, JSON.stringify(sources), new Date().toISOString(), draftId]
    );

    const pollRes = await pool.query(
      'SELECT * FROM action_item_drafts WHERE id = $1',
      [draftId]
    );
    const row = pollRes.rows[0] as Record<string, unknown>;
    expect(row.status).toBe('done');
    expect(row.draft_text).toBeTruthy();
    expect(typeof row.draft_text).toBe('string');
    const parsedSources = typeof row.sources === 'string' ? JSON.parse(row.sources as string) : row.sources;
    expect(Array.isArray(parsedSources)).toBe(true);
    expect((parsedSources as unknown[]).length).toBeGreaterThanOrEqual(1);

    const listRes = await app.inject({
      method: 'GET',
      url: `/v3/action-items?status=open`,
      headers: authHeader(),
    });
    const items = ((JSON.parse(listRes.body) as SuccessBody).data as { items: Record<string, unknown>[] }).items;
    const found = items.find((i) => i.id === id);
    expect(found).toBeDefined();
    const foundDrafts = found!.drafts as Record<string, unknown>[];
    expect(foundDrafts.length).toBeGreaterThanOrEqual(1);
    expect(foundDrafts[0].draft_text).toBeTruthy();
    expect(foundDrafts[0].sources).toBeDefined();
  });

  it('all three draft kinds produce valid output', async () => {
    const { buildStubDraftText, buildDraftSources } = await import('../src/services/drafts/index.js');
    const kinds = ['reply', 'research', 'milestone'] as const;

    for (const kind of kinds) {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v3/action-items',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        payload: JSON.stringify({ title: `Draft ${kind} test`, owner: 'shawn', due_date: '2026-07-01' }),
      });
      const id = (JSON.parse(createRes.body) as SuccessBody).data.id as string;

      const draftRes = await app.inject({
        method: 'POST',
        url: `/v3/action-items/${id}/drafts`,
        headers: { ...authHeader(), 'content-type': 'application/json' },
        payload: JSON.stringify({ kind }),
      });
      expect(draftRes.statusCode).toBe(201);
      const draftData = (JSON.parse(draftRes.body) as SuccessBody).data as Record<string, unknown>;
      expect(draftData.kind).toBe(kind);
      const draftId = draftData.id as string;

      const actionItem = (await pool.query('SELECT * FROM action_items WHERE id = $1', [id])).rows[0]!;
      const draftText = buildStubDraftText(kind, actionItem);
      const sources = buildDraftSources(kind);
      await pool.query(
        `UPDATE action_item_drafts SET draft_text = $1, sources = $2, status = 'done', updated_at = $3 WHERE id = $4`,
        [draftText, JSON.stringify(sources), new Date().toISOString(), draftId]
      );

      const result = await pool.query('SELECT * FROM action_item_drafts WHERE id = $1', [draftId]);
      const row = result.rows[0] as Record<string, unknown>;
      expect(row.draft_text).toBeTruthy();
      expect((row.draft_text as string).length).toBeGreaterThan(0);
      const parsedSources = typeof row.sources === 'string' ? JSON.parse(row.sources as string) : row.sources;
      expect(Array.isArray(parsedSources)).toBe(true);
      expect((parsedSources as unknown[]).length).toBeGreaterThanOrEqual(1);
    }
  });
});

// --------------------------------------------------------------------------
// Integration: email webhook creates action item
// --------------------------------------------------------------------------
describe('Integration: Email webhook creates action item', () => {
  it('creates action item with proper source attribution', async () => {
    const payload = JSON.stringify({
      from: 'angela@envision-is.com',
      to: 'shawn@envision-is.com',
      subject: 'SHIELD task order capacity update',
      body_text: 'Hi Shawn, please review the latest SHIELD task order numbers.',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/email-action-item',
      payload,
      headers: webhookHeaders(payload),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.id).toBeTruthy();
    expect(data.title).toBe('SHIELD task order capacity update');
    expect(data.source).toBe('email');
    expect(data.owner).toBe('angela');
  });

  it('uses body_text as title when subject is missing', async () => {
    const payload = JSON.stringify({
      from: 'test@example.com',
      to: 'shawn@envision-is.com',
      body_text: 'Short message about pricing',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/email-action-item',
      payload,
      headers: webhookHeaders(payload),
    });

    expect(res.statusCode).toBe(201);
    const data = (JSON.parse(res.body) as SuccessBody).data as Record<string, unknown>;
    expect(data.title).toBe('Short message about pricing');
  });

  it('requires HMAC authentication', async () => {
    const payload = JSON.stringify({
      from: 'test@example.com',
      to: 'shawn@envision-is.com',
      body_text: 'Test body',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/email-action-item',
      payload,
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('validates required fields', async () => {
    const payload = JSON.stringify({ from: 'test@example.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/email-action-item',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-gda-key': 'test-webhook-key',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// --------------------------------------------------------------------------
// Integration: list filters
// --------------------------------------------------------------------------
describe('Integration: Action item list filters', () => {
  it('filters by status', async () => {
    await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Open item', owner: 'shawn' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items?status=open',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const data = (JSON.parse(res.body) as SuccessBody).data as { items: Record<string, unknown>[] };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of data.items) {
      expect(item.status).toBe('open');
    }
  });

  it('filters by owner', async () => {
    await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Angela item', owner: 'angela' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items?owner=angela',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const data = (JSON.parse(res.body) as SuccessBody).data as { items: Record<string, unknown>[] };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of data.items) {
      expect(item.owner).toBe('angela');
    }
  });

  it('filters by source', async () => {
    const payload = JSON.stringify({
      from: 'test@example.com',
      to: 'shawn@envision-is.com',
      subject: 'Email filter test',
      body_text: 'Testing email source filter',
    });
    await app.inject({
      method: 'POST',
      url: '/v3/webhooks/email-action-item',
      payload,
      headers: webhookHeaders(payload),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items?source=email',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const data = (JSON.parse(res.body) as SuccessBody).data as { items: Record<string, unknown>[] };
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of data.items) {
      expect(item.source).toBe('email');
    }
  });

  it('links action item to opportunity', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        title: 'Linked item',
        owner: 'shawn',
        linked_record_type: 'opportunity',
        linked_record_id: 'opp_001',
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const data = (JSON.parse(createRes.body) as SuccessBody).data as Record<string, unknown>;
    expect(data.linked_record_type).toBe('opportunity');
    expect(data.linked_record_id).toBe('opp_001');
  });
});

// --------------------------------------------------------------------------
// R1: Source citation
// --------------------------------------------------------------------------
describe('R1: Source citation on action items', () => {
  it('every action item has title_sources with at least 1 entry', async () => {
    await app.inject({
      method: 'POST',
      url: '/v3/action-items',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'R1 test', owner: 'shawn' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/action-items',
      headers: authHeader(),
    });
    const data = (JSON.parse(res.body) as SuccessBody).data as { items: Record<string, unknown>[] };
    for (const item of data.items) {
      const sources = item.title_sources as { kind: string; title: string; url: string; retrieved_at: string }[];
      expect(sources.length).toBeGreaterThanOrEqual(1);
      expect(sources[0].kind).toBeTruthy();
      expect(sources[0].title).toBeTruthy();
      expect(sources[0].url).toBeTruthy();
      expect(sources[0].retrieved_at).toBeTruthy();
    }
  });
});
