/**
 * F-234: Fast-track route tests (migrated from tests/routes/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp } from './helpers.js';

const { Pool } = pg;

let app: FastifyInstance;
let pool: InstanceType<typeof Pool>;

const validInput = {
  title: 'Army RS3 Task Order',
  description: 'Sustainment support for TACOM logistics operations.',
  naics_codes: ['541330', '541611'],
  set_aside: 'SDB',
  place_of_performance: 'Warren, MI',
};

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });
  await pool.query('DELETE FROM fast_track_assessments');
  app = await getApp();
}, 120_000);

afterAll(async () => {
  await pool.query('DELETE FROM fast_track_assessments');
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

describe('POST /v3/fastrac', () => {
  it('should return 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      payload: validInput,
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 VALIDATION_ERROR for missing title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: { ...validInput, title: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for malformed NAICS code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: { ...validInput, naics_codes: ['12345'] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for oversize description', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: { ...validInput, description: 'x'.repeat(50001) },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for too many NAICS codes', async () => {
    const codes = Array.from({ length: 11 }, (_, i) => String(100000 + i));
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: { ...validInput, naics_codes: codes },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return 503 ANALYSIS_TIMEOUT when worker never writes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: validInput,
    });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string }; meta: { source: string; requestId: string } };
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
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: validInput,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: {
        cache_hit: boolean; grade: string; rationale: string;
        naics_match_score: number; recommended_action: string;
        source_chips: unknown[]; model_used: string; id: string;
      };
      meta: { source: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.cache_hit).toBe(true);
    expect(body.data.grade).toBe('A');
    expect(body.data.rationale).toBe('Strong NAICS match');
    expect(body.data.naics_match_score).toBe(85);
    expect(body.data.recommended_action).toBe('pursue');
    expect(body.data.source_chips).toBeInstanceOf(Array);
    expect((body.data.source_chips as unknown[]).length).toBeGreaterThan(0);
    expect(body.data.model_used).toBe('test-model');
    expect(body.data.id).toBeTruthy();
    expect(body.meta.source).toBe('v3');
  });

  it('should return cache hit on second call with identical input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/fastrac',
      headers: authHeader(),
      payload: validInput,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { cache_hit: boolean } };
    expect(body.data.cache_hit).toBe(true);
  });
});

describe('GET /v3/fastrac/:id', () => {
  it('should return 200 for existing assessment', async () => {
    const rows = await pool.query<{ id: string }>('SELECT id FROM fast_track_assessments LIMIT 1');
    const id = rows.rows[0]?.id;
    if (!id) return;

    const res = await app.inject({
      method: 'GET',
      url: `/v3/fastrac/${id}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { id: string; grade: string; source_chips: unknown[] } };
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(String(id));
    expect(body.data.grade).toBeTruthy();
    expect(body.data.source_chips).toBeInstanceOf(Array);
  });

  it('should return 404 for non-existent id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/fastrac/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /v3/fastrac (list)', () => {
  it('should return paginated list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/fastrac',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { items: unknown[]; next_cursor: unknown } };
    expect(body.success).toBe(true);
    expect(body.data.items).toBeInstanceOf(Array);
    expect(body.data).toHaveProperty('next_cursor');
  });

  it('should filter by since parameter', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/v3/fastrac?since=${futureDate}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { items: unknown[] } };
    expect(body.data.items).toHaveLength(0);
  });

  it('should respect limit parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/fastrac?limit=1',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { items: unknown[] } };
    expect(body.data.items.length).toBeLessThanOrEqual(1);
  });
});
