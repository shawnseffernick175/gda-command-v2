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
    { algorithm: 'HS256', expiresIn: '1h' }
  );
  return { authorization: `Bearer ${token}` };
}

async function ensureTestSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        url TEXT,
        title TEXT,
        retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confidence TEXT NOT NULL DEFAULT 'high',
        meta JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      INSERT INTO sources (id, kind, title, retrieved_at)
      VALUES (1, 'internal', 'Test source', NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        agency TEXT,
        sub_agency TEXT,
        solicitation_number TEXT,
        sam_notice_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'discovery',
        grade TEXT,
        grade_evidence TEXT,
        value_min NUMERIC,
        value_max NUMERIC,
        naics TEXT,
        psc TEXT,
        set_aside TEXT,
        place_of_performance TEXT,
        response_due_at TIMESTAMPTZ,
        posted_at TIMESTAMPTZ,
        incumbent TEXT,
        incumbent_confidence TEXT,
        incumbent_source TEXT,
        description TEXT,
        tags TEXT[] NOT NULL DEFAULT '{}',
        data_source TEXT NOT NULL DEFAULT 'manual',
        analysis JSONB,
        analysis_version TEXT,
        ai_analyzed_at TIMESTAMPTZ,
        is_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
        source_id BIGINT NOT NULL DEFAULT 1,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
  } finally {
    client.release();
  }
}

async function insertTestOpportunity(overrides: Record<string, unknown> = {}): Promise<string> {
  const defaults = {
    title: 'Test Opportunity',
    status: 'discovery',
    source_id: 1,
    analysis: null,
    analysis_version: null,
    ai_analyzed_at: null,
    updated_at: new Date().toISOString(),
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, status, source_id, analysis, analysis_version, ai_analyzed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [data.title, data.status, data.source_id, data.analysis ? JSON.stringify(data.analysis) : null,
     data.analysis_version, data.ai_analyzed_at, data.updated_at]
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
      analysis: { pwin: 0.5, version: 'v0.0.1-test', generated_at: now },
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
    const body = JSON.parse(res.body) as { success: boolean; data: { analysis: unknown } };
    expect(body.success).toBe(true);
    expect(body.data.analysis).toBeDefined();
    expect(body.data.analysis).not.toBeNull();
  });
});

describe('Integration: detail endpoint pre-warm completes within timeout', () => {
  it('returns 200 after analysis job completes', async () => {
    const id = await insertTestOpportunity({
      title: 'Test PreWarm',
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
        const body = JSON.parse(res.body) as { success: boolean; data: { analysis: unknown } };
        expect(body.success).toBe(true);
        expect(body.data.analysis).not.toBeNull();
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
