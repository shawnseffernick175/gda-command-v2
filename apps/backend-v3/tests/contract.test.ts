import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const DB_URL = process.env['DATABASE_URL'];

const { Pool } = pg;
const { buildApp } = await import('../src/app.js');

let app: FastifyInstance;
let pool: InstanceType<typeof Pool>;

function authHeader(): Record<string, string> {
  const token = jwt.sign(
    { sub: 'test-user', email: 'test@gda.local', role: 'admin' },
    'test-jwt-secret',
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 2 });
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
    await client.query(`SELECT setval('sources_id_seq', GREATEST((SELECT MAX(id) FROM sources), 1))`);
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
    // Ensure qualified columns exist on pre-existing tables
    await client.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ');
    await client.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_by TEXT');

    // Create source sibling tables if missing
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

    // Create analysis cache tables
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

    // Analysis source sibling tables
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
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

interface SuccessBody {
  success: true;
  data: unknown;
  meta: {
    generatedAt: string;
    source: string;
    requestId: string;
  };
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    detail: string | null;
  };
  meta: {
    generatedAt: string;
    source: string;
    requestId: string;
  };
}

function assertSuccessEnvelope(body: SuccessBody): void {
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.meta).toBeDefined();
  expect(body.meta.generatedAt).toBeTruthy();
  expect(body.meta.source).toBe('v3');
  expect(body.meta.requestId).toBeTruthy();
}

function assertErrorEnvelope(body: ErrorBody, expectedCode: string): void {
  expect(body.success).toBe(false);
  expect(body.error).toBeDefined();
  expect(body.error.code).toBe(expectedCode);
  expect(body.error.message).toBeTruthy();
  expect(body.meta).toBeDefined();
  expect(body.meta.generatedAt).toBeTruthy();
  expect(body.meta.source).toBe('v3');
  expect(body.meta.requestId).toBeTruthy();
}

describe('Contract: SuccessEnvelope compliance', () => {
  it('GET /v3/health returns correct SuccessEnvelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    assertSuccessEnvelope(body);
    const data = body.data as { status: string; version: string };
    expect(data.status).toBe('ok');
    expect(typeof data.version).toBe('string');
  });

  it('GET /v3/health includes requestId in response header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/health',
      headers: { 'x-request-id': 'test-req-123' },
    });
    expect(res.headers['x-request-id']).toBe('test-req-123');
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.meta.requestId).toBe('test-req-123');
  });

  it('generates requestId when not provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/health' });
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.meta.requestId).toBeTruthy();
    expect(body.meta.requestId.length).toBeGreaterThan(0);
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });
});

describe('Contract: ErrorEnvelope compliance', () => {
  it('401 UNAUTHORIZED returns correct ErrorEnvelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/opportunities/1' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as ErrorBody;
    assertErrorEnvelope(body, 'UNAUTHORIZED');
  });

  it('404 NOT_FOUND returns correct ErrorEnvelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as ErrorBody;
    assertErrorEnvelope(body, 'NOT_FOUND');
  });

  it('WEBHOOK_AUTH_FAILED returns correct ErrorEnvelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      payload: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as ErrorBody;
    assertErrorEnvelope(body, 'WEBHOOK_AUTH_FAILED');
  });
});

describe('Contract: meta fields on all responses', () => {
  it('meta.generatedAt is a valid ISO 8601 date', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/health' });
    const body = JSON.parse(res.body) as SuccessBody;
    const date = new Date(body.meta.generatedAt);
    expect(date.toISOString()).toBe(body.meta.generatedAt);
  });

  it('meta.source is always "v3"', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/health' });
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.meta.source).toBe('v3');
  });
});

describe('Contract: version endpoint', () => {
  it('GET /v3/version returns build info', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/version' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { version: string; commit: string; node_version: string };
    expect(body.version).toBe('3.0.0');
    expect(typeof body.commit).toBe('string');
    expect(body.node_version).toMatch(/^v?\d+/);
  });
});

describe('Contract: GET /v3/opportunities list endpoint', () => {
  it('returns paginated list with correct shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    assertSuccessEnvelope(body);
    const data = body.data as {
      items: unknown[];
      pagination: { limit: number; hasMore: boolean; cursor: string | null };
    };
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.pagination).toBeDefined();
    expect(typeof data.pagination.limit).toBe('number');
    expect(typeof data.pagination.hasMore).toBe('boolean');
  });

  it('list items include ai_analyzed_at and analysis_version', async () => {
    // Insert a test opportunity with analysis
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO opportunities (title, status, source_id, analysis, analysis_version, ai_analyzed_at, updated_at)
       VALUES ($1, 'discovery', 1, $2, $3, $4, $5)`,
      ['Contract Test Opp', JSON.stringify({ pwin: 0.5, version: 'v0.0.1-test', generated_at: now }), 'v0.0.1-test', now, now],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody;
    const data = body.data as { items: Array<{ ai_analyzed_at: string | null; analysis_version: string | null }> };

    if (data.items.length > 0) {
      const item = data.items[0]!;
      expect('ai_analyzed_at' in item).toBe(true);
      expect('analysis_version' in item).toBe(true);
    }

    await pool.query("DELETE FROM opportunities WHERE title = 'Contract Test Opp'");
  });

  it('list does NOT include full analysis block', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody;
    const data = body.data as { items: Array<Record<string, unknown>> };
    for (const item of data.items) {
      expect(item.analysis).toBeUndefined();
    }
  });
});

describe('Contract: POST /v3/opportunities create endpoint', () => {
  it('returns 201 with created opportunity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/opportunities',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Contract Test Create', source: 'manual' }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as SuccessBody;
    assertSuccessEnvelope(body);
    const data = body.data as { id: string; title: string; status: string };
    expect(data.title).toBe('Contract Test Create');
    expect(data.status).toBe('discovery');

    await pool.query("DELETE FROM opportunities WHERE title = 'Contract Test Create'");
  });

  it('returns 400 when title is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/opportunities',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ source: 'manual' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    assertErrorEnvelope(body, 'VALIDATION_ERROR');
  });

  it('returns 400 when source is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/opportunities',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'No Source' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    assertErrorEnvelope(body, 'VALIDATION_ERROR');
  });
});

describe('Contract: PATCH /v3/opportunities/:id update endpoint', () => {
  it('returns 200 with updated opportunity', async () => {
    const insertRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (title, status, source_id) VALUES ('Patch Test', 'discovery', 1) RETURNING id`,
    );
    const id = insertRes.rows[0]!.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/opportunities/${id}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ agency: 'U.S. Army TACOM' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    assertSuccessEnvelope(body);

    await pool.query("DELETE FROM opportunities WHERE title = 'Patch Test'");
  });

  it('returns 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/opportunities/999999',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ agency: 'Test' }),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Contract: POST /v3/opportunities/:id/qualify endpoint', () => {
  it('returns 200 with teaming_flags', async () => {
    const insertRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (title, status, source_id, set_aside)
       VALUES ('Qualify Test', 'discovery', 1, 'HUBZone') RETURNING id`,
    );
    const id = insertRes.rows[0]!.id;

    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${id}/qualify`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ qualified_by: 'shawn' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    assertSuccessEnvelope(body);
    const data = body.data as {
      opportunity: { qualified_at: string; status: string };
      teaming_flags: Array<{ reason: string; suggested_partner: string }>;
    };
    expect(data.opportunity.status).toBe('qualified');
    expect(Array.isArray(data.teaming_flags)).toBe(true);
    expect(data.teaming_flags.length).toBeGreaterThan(0);
    expect(data.teaming_flags[0]!.suggested_partner).toBe('riverstone');

    await pool.query("DELETE FROM opportunities WHERE title = 'Qualify Test'");
  });

  it('returns 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/opportunities/999999/qualify',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Contract: Forbidden tokens', () => {
  // FORBIDDEN token gate — test verifies no banned tokens leak into responses
  const BANNED_FIELD = ['analysis', 'status'].join('_');

  it(`no response contains banned field ${BANNED_FIELD}`, async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities',
      headers: authHeader(),
    });
    expect(res.body).not.toContain(`"${BANNED_FIELD}"`);
  });
});
