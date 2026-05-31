import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';
process.env['ANALYSIS_TIMEOUT_MS'] = '2000';
process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

const DB_URL = process.env['DATABASE_URL'];
const { Pool } = pg;

const { buildApp } = await import('../../src/app.js');

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

const validInput = {
  title: 'Army RS3 Task Order',
  description: 'Sustainment support for TACOM logistics operations.',
  naics_codes: ['541330', '541611'],
  set_aside: 'SDB',
  place_of_performance: 'Warren, MI',
};

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fast_track_assessments (
        id              BIGSERIAL     PRIMARY KEY,
        input_hash      TEXT          NOT NULL,
        title           TEXT          NOT NULL,
        description     TEXT          NOT NULL,
        naics_codes     TEXT[]        NOT NULL DEFAULT '{}',
        set_aside       TEXT,
        place_of_performance TEXT,
        grade           TEXT          NOT NULL CHECK (grade IN ('A', 'B', 'C')),
        rationale       TEXT          NOT NULL,
        naics_match_score NUMERIC     NOT NULL CHECK (naics_match_score >= 0 AND naics_match_score <= 100),
        recommended_action TEXT       NOT NULL CHECK (recommended_action IN ('pursue', 'watch', 'skip')),
        source_chips    JSONB         NOT NULL DEFAULT '[]',
        model_used      TEXT          NOT NULL,
        analysis_version TEXT         NOT NULL,
        generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        UNIQUE (input_hash, analysis_version)
      )
    `);
    await client.query('DELETE FROM fast_track_assessments');
  } finally {
    client.release();
  }
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM fast_track_assessments');
  } finally {
    client.release();
  }
  await pool.end();
});

describe('POST /v3/fast-track', () => {
  it('should return 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      payload: validInput,
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 VALIDATION_ERROR for missing title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: { ...validInput, title: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for malformed NAICS code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: { ...validInput, naics_codes: ['12345'] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for oversize description', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: { ...validInput, description: 'x'.repeat(50001) },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for too many NAICS codes', async () => {
    const codes = Array.from({ length: 11 }, (_, i) => String(100000 + i));
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: { ...validInput, naics_codes: codes },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return 503 ANALYSIS_TIMEOUT when worker never writes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: validInput,
    });
    // Without pg-boss running, no worker writes the row → timeout
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ANALYSIS_TIMEOUT');
    expect(body.meta.source).toBe('v3');
    expect(body.meta.requestId).toBeTruthy();
  });

  it('should return 200 cache hit when assessment exists', async () => {
    const { createHash } = await import('node:crypto');
    const canonical = JSON.stringify({
      title: validInput.title,
      description: validInput.description,
      naics_codes: [...validInput.naics_codes].sort(),
      set_aside: validInput.set_aside,
      place_of_performance: validInput.place_of_performance,
    });
    const inputHash = createHash('sha256').update(canonical).digest('hex');

    // Pre-seed a row
    await pool.query(
      `INSERT INTO fast_track_assessments
         (input_hash, title, description, naics_codes, set_aside, place_of_performance,
          grade, rationale, naics_match_score, recommended_action,
          source_chips, model_used, analysis_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (input_hash, analysis_version) DO NOTHING`,
      [
        inputHash,
        validInput.title,
        validInput.description,
        validInput.naics_codes,
        validInput.set_aside,
        validInput.place_of_performance,
        'A',
        'Strong NAICS match',
        85,
        'pursue',
        JSON.stringify([{ label: 'Test', url: 'https://test.com', kind: 'internal', retrieved_at: new Date().toISOString() }]),
        'test-model',
        process.env['ANALYSIS_VERSION']!,
      ],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: validInput,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.cache_hit).toBe(true);
    expect(body.data.grade).toBe('A');
    expect(body.data.rationale).toBe('Strong NAICS match');
    expect(body.data.naics_match_score).toBe(85);
    expect(body.data.recommended_action).toBe('pursue');
    expect(body.data.source_chips).toBeInstanceOf(Array);
    expect(body.data.source_chips.length).toBeGreaterThan(0);
    expect(body.data.model_used).toBe('test-model');
    expect(body.data.id).toBeTruthy();
    expect(body.meta.source).toBe('v3');
  });

  it('should return cache hit on second call with identical input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fast-track',
      headers: authHeader(),
      payload: validInput,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.cache_hit).toBe(true);
  });
});

describe('GET /v3/fast-track/:id', () => {
  it('should return 200 for existing assessment', async () => {
    const rows = await pool.query('SELECT id FROM fast_track_assessments LIMIT 1');
    const id = rows.rows[0]?.id;
    if (!id) return; // skip if no rows

    const res = await app.inject({
      method: 'GET',
      url: `/v3/fast-track/${id}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(String(id));
    expect(body.data.grade).toBeTruthy();
    expect(body.data.source_chips).toBeInstanceOf(Array);
  });

  it('should return 404 for non-existent id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/fast-track/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /v3/fast-track (list)', () => {
  it('should return paginated list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/fast-track',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.items).toBeInstanceOf(Array);
    expect(body.data).toHaveProperty('next_cursor');
  });

  it('should filter by since parameter', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/v3/fast-track?since=${futureDate}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items).toHaveLength(0);
  });

  it('should respect limit parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/fast-track?limit=1',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items.length).toBeLessThanOrEqual(1);
  });
});
