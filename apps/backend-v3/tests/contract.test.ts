import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';

const DB_URL = process.env['DATABASE_URL'];

const { Pool } = pg;
const { buildApp } = await import('../src/app.js');

let app: FastifyInstance;
let pool: InstanceType<typeof Pool>;

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
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
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
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({ sub: 'u1' }, 'test-jwt-secret', { algorithm: 'HS256', expiresIn: '1h' });
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/999999',
      headers: { authorization: `Bearer ${token}` },
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
