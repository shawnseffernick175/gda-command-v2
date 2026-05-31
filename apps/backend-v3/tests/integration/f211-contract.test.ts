/**
 * F-234: F-211 Launchpad contract tests (migrated from tests/).
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

interface SuccessBody<T = unknown> {
  success: true;
  data: T;
  meta: { generatedAt: string; source: string; requestId: string };
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; detail: string | null };
  meta: { generatedAt: string; source: string; requestId: string };
}

function assertSuccessEnvelope(body: SuccessBody): void {
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.meta).toBeDefined();
  expect(body.meta.generatedAt).toBeTruthy();
  expect(body.meta.source).toBe('v3');
  expect(body.meta.requestId).toBeTruthy();
}

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });
  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

// ============================================================================
// Launchpad contract tests
// ============================================================================
describe('Contract: GET /v3/launchpad/summary', () => {
  it('returns SuccessEnvelope with summary counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{
      qualified_due_this_week: number;
      pipeline_no_capture: number;
      captures_color_review_stale: number;
      action_items_open_today: number;
      action_items_overdue: number;
    }>;
    assertSuccessEnvelope(body);
    expect(typeof body.data.qualified_due_this_week).toBe('number');
    expect(typeof body.data.pipeline_no_capture).toBe('number');
    expect(typeof body.data.captures_color_review_stale).toBe('number');
    expect(typeof body.data.action_items_open_today).toBe('number');
    expect(typeof body.data.action_items_overdue).toBe('number');
  });

  it('includes R1 source citations on each count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody<Record<string, unknown>>;
    const data = body.data;
    expect(data.qualified_due_this_week_sources).toBeDefined();
    expect(data.pipeline_no_capture_sources).toBeDefined();
    expect(data.captures_color_review_stale_sources).toBeDefined();
    expect(data.action_items_open_today_sources).toBeDefined();
    expect(data.action_items_overdue_sources).toBeDefined();
  });

  it('returns X-Cache-Hit header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
      headers: authHeader(),
    });
    expect(res.headers['x-cache-hit']).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/summary',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: GET /v3/launchpad/flags', () => {
  it('returns SuccessEnvelope with flags array and R1 sources on counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/flags',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{
      flags: unknown[];
      compliance_gaps: number;
      compliance_gaps_sources: unknown[];
      teaming_unresolved: number;
      teaming_unresolved_sources: unknown[];
      analysis_timeouts_24h: number;
      analysis_timeouts_24h_sources: unknown[];
    }>;
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data.flags)).toBe(true);
    expect(typeof body.data.compliance_gaps).toBe('number');
    expect(Array.isArray(body.data.compliance_gaps_sources)).toBe(true);
    expect(typeof body.data.teaming_unresolved).toBe('number');
    expect(Array.isArray(body.data.teaming_unresolved_sources)).toBe(true);
    expect(typeof body.data.analysis_timeouts_24h).toBe('number');
    expect(Array.isArray(body.data.analysis_timeouts_24h_sources)).toBe(true);
  });

  it('returns X-Cache-Hit header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/flags',
      headers: authHeader(),
    });
    expect(res.headers['x-cache-hit']).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/flags',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// Sources contract tests
// ============================================================================
describe('Contract: GET /v3/sources', () => {
  it('returns SuccessEnvelope with items array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/sources',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{ items: unknown[] }>;
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/sources' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: POST /v3/sources', () => {
  it('creates a source with valid kind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/sources',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'internal', title: 'Test Manual Source' }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as SuccessBody<{ source: { kind: string } }>;
    assertSuccessEnvelope(body);
    expect(body.data.source.kind).toBe('internal');
  });

  it('rejects invalid kind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/sources',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'invalid_kind' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/sources',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ kind: 'internal' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: GET /v3/sources/:id', () => {
  it('returns source detail for existing source', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/sources/1',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{ source: { id: string } }>;
    assertSuccessEnvelope(body);
    expect(body.data.source).toBeDefined();
  });

  it('returns 404 for non-existent source', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/sources/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/sources/1' });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// Partners contract tests
// ============================================================================
describe('Contract: GET /v3/partners', () => {
  it('returns SuccessEnvelope with items array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/partners',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{ items: { id: string }[] }>;
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBe(2);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/partners' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: GET /v3/partners/:id', () => {
  it('returns riverstone partner detail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/partners/riverstone',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{
      id: string;
      display_name: string;
      certifications: { name: string }[];
      capabilities: string[];
      capabilities_sources: unknown[];
      past_performance_summary_sources: unknown[];
    }>;
    assertSuccessEnvelope(body);
    expect(body.data.id).toBe('riverstone');
    expect(body.data.display_name).toBe('Riverstone Solutions');
    expect(body.data.certifications.length).toBeGreaterThan(0);
    expect(body.data.capabilities.length).toBeGreaterThan(0);
    expect(Array.isArray(body.data.capabilities_sources)).toBe(true);
    expect(body.data.capabilities_sources.length).toBeGreaterThan(0);
    expect(typeof body.data.past_performance_summary_sources).not.toBe('undefined');
    expect(Array.isArray(body.data.past_performance_summary_sources)).toBe(true);
  });

  it('returns pd_systems partner detail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/partners/pd_systems',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{ id: string }>;
    expect(body.data.id).toBe('pd_systems');
  });

  it('returns 404 for invalid partner id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/partners/nonexistent',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/partners/riverstone' });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// Version endpoint (extended)
// ============================================================================
describe('Contract: GET /v3/version (extended)', () => {
  it('returns model_versions and queue_depths', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/version' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      version: string;
      commit: string;
      node_version: string;
      model_versions: { analysis: string };
      queue_depths: Record<string, number>;
    };
    expect(body.version).toBe('3.0.0');
    expect(typeof body.commit).toBe('string');
    expect(body.node_version).toMatch(/^v?\d+/);
    expect(body.model_versions).toBeDefined();
    expect(typeof body.model_versions.analysis).toBe('string');
    expect(body.queue_depths).toBeDefined();
  });

  it('returns current git sha', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/version' });
    const body = JSON.parse(res.body) as { commit: string };
    expect(typeof body.commit).toBe('string');
    expect(body.commit.length).toBeGreaterThan(0);
  });
});
