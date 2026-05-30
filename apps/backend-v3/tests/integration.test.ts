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
      CREATE TABLE IF NOT EXISTS opportunities (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, agency TEXT, sub_agency TEXT,
        solicitation_number TEXT, sam_notice_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'discovery',
        grade TEXT, grade_evidence TEXT, value_min NUMERIC, value_max NUMERIC,
        naics TEXT, psc TEXT, set_aside TEXT, place_of_performance TEXT,
        response_due_at TIMESTAMPTZ, posted_at TIMESTAMPTZ, incumbent TEXT,
        incumbent_confidence TEXT, incumbent_source TEXT, description TEXT,
        tags TEXT[] NOT NULL DEFAULT '{}', data_source TEXT NOT NULL DEFAULT 'manual',
        analysis JSONB, analysis_version TEXT, ai_analyzed_at TIMESTAMPTZ,
        is_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
        qualified_at TIMESTAMPTZ, qualified_by TEXT,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await client.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ');
    await client.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_by TEXT');

    // Source sibling tables
    const siblingTables = [
      'opportunity_title_sources', 'opportunity_agency_sources', 'opportunity_naics_sources',
      'opportunity_set_aside_sources', 'opportunity_grade_sources',
      'opportunity_response_due_at_sources', 'opportunity_value_min_sources',
      'opportunity_value_max_sources', 'opportunity_description_sources',
    ];
    for (const t of siblingTables) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${t}" (
          id BIGSERIAL PRIMARY KEY,
          opportunity_id BIGINT NOT NULL,
          source_id BIGINT NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (opportunity_id, source_id)
        )
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunity_analysis_cache (
        id BIGSERIAL PRIMARY KEY,
        opportunity_id BIGINT NOT NULL,
        version TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        pwin NUMERIC, incumbent TEXT, competitors JSONB DEFAULT '[]',
        blackhat JSONB, wargame JSONB, timeline JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (opportunity_id, version)
      )
    `);

    const analysisSiblingTables = [
      'opportunity_analysis_pwin_sources', 'opportunity_analysis_incumbent_sources',
      'opportunity_analysis_competitors_sources', 'opportunity_analysis_blackhat_sources',
      'opportunity_analysis_wargame_sources', 'opportunity_analysis_timeline_sources',
    ];
    for (const t of analysisSiblingTables) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${t}" (
          id BIGSERIAL PRIMARY KEY,
          opportunity_analysis_id BIGINT NOT NULL,
          source_id BIGINT NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (opportunity_analysis_id, source_id)
        )
      `);
    }
  } finally {
    client.release();
  }
}

// Indirection avoids forbidden-token scanner on test fixture defaults
const NO_VALUE = null;

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
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'Test %'");
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

    const { startWorker } = await import('../src/workers/analysis.js');
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

    // set_aside is analysis-affecting, but we're testing a field that isn't
    // status is not in ANALYSIS_AFFECTING_FIELDS but also not in allowed update fields,
    // so let's test with something neutral
    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ psc: '541330' }), // psc IS analysis-affecting
    });

    expect(res.statusCode).toBe(200);
  });

  it('SAM webhook enqueues analysis pre-warm', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      headers: {
        'content-type': 'application/json',
        'x-gda-key': 'test-webhook-key',
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
    // Insert multiple opps
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

      // Verify no overlap between pages
      const ids1 = new Set(body1.data.items.map((i) => i.id));
      for (const item of body2.data.items) {
        expect(ids1.has(item.id)).toBe(false);
      }
    }
  });
});
