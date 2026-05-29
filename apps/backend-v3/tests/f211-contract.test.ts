import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
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

function authHeader(): Record<string, string> {
  const token = jwt.sign(
    { sub: 'test-user', email: 'test@gda.local', role: 'admin' },
    'test-jwt-secret',
    { algorithm: 'HS256', expiresIn: '1h' }
  );
  return { authorization: `Bearer ${token}` };
}

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
    await client.query(`SELECT setval('sources_id_seq', (SELECT COALESCE(MAX(id), 0) FROM sources))`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator', is_active BOOLEAN NOT NULL DEFAULT TRUE,
        password_hash TEXT, last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, agency TEXT, sub_agency TEXT,
        department TEXT, solicitation_number TEXT, sam_notice_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'discovery', grade TEXT, grade_evidence TEXT,
        value_min NUMERIC, value_max NUMERIC, naics TEXT, psc TEXT, set_aside TEXT,
        place_of_performance TEXT, response_due_at TIMESTAMPTZ, posted_at TIMESTAMPTZ,
        incumbent TEXT, incumbent_confidence TEXT, incumbent_source TEXT, description TEXT,
        tags TEXT[] NOT NULL DEFAULT '{}', data_source TEXT NOT NULL DEFAULT 'manual',
        analysis JSONB, analysis_version TEXT, ai_analyzed_at TIMESTAMPTZ,
        is_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_items (
        id BIGSERIAL PRIMARY KEY, opportunity_id BIGINT NOT NULL,
        capture_owner TEXT NOT NULL, win_probability NUMERIC,
        win_prob_evidence TEXT, milestone_90day TEXT, estimated_value NUMERIC,
        stage TEXT NOT NULL DEFAULT 'qualifying',
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS captures (
        id BIGSERIAL PRIMARY KEY, pipeline_item_id BIGINT NOT NULL,
        color_stage TEXT NOT NULL DEFAULT 'pink',
        capture_plan JSONB NOT NULL DEFAULT '{}', pricing_notes TEXT,
        compliance_status TEXT NOT NULL DEFAULT 'incomplete',
        win_themes TEXT[], ghost_team JSONB,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_items (
        id BIGSERIAL PRIMARY KEY, capture_id BIGINT NOT NULL,
        requirement TEXT NOT NULL, section_ref TEXT,
        status TEXT NOT NULL DEFAULT 'open', response_notes TEXT, assigned_to TEXT,
        source_id BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_items (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT,
        owner_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'normal',
        due_date TIMESTAMPTZ, origin TEXT NOT NULL DEFAULT 'manual', origin_ref TEXT,
        opportunity_id BIGINT, partner_context TEXT,
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
        anchor_company TEXT NOT NULL, ceo TEXT, hq_location TEXT,
        founded_year INTEGER, uei TEXT, cage TEXT, duns TEXT,
        naics_codes TEXT[] NOT NULL DEFAULT '{}',
        certifications JSONB NOT NULL DEFAULT '[]',
        vehicles JSONB NOT NULL DEFAULT '[]',
        capabilities TEXT[], contact_info JSONB NOT NULL DEFAULT '{}', notes TEXT,
        source_id BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS teaming_attachments (
        id BIGSERIAL PRIMARY KEY, opportunity_id BIGINT NOT NULL,
        partner_id BIGINT NOT NULL, reason TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'subcontractor',
        status TEXT NOT NULL DEFAULT 'proposed',
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS launchpad_flags (
        id BIGSERIAL PRIMARY KEY, flag_type TEXT NOT NULL,
        severity TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
        entity_type TEXT, entity_id BIGINT, doctrine_anchor TEXT,
        source_id BIGINT NOT NULL DEFAULT 1, source_url TEXT,
        dismissed_at TIMESTAMPTZ, dismissed_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT,
        action TEXT NOT NULL, table_name TEXT NOT NULL, record_id BIGINT,
        old_values JSONB, new_values JSONB, ip_address INET, user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 5 });
  await ensureTestSchema();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

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
  it('returns SuccessEnvelope with flags array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/launchpad/flags',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody<{ flags: unknown[] }>;
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data.flags)).toBe(true);
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
    }>;
    assertSuccessEnvelope(body);
    expect(body.data.id).toBe('riverstone');
    expect(body.data.display_name).toBe('Riverstone Solutions');
    expect(body.data.certifications.length).toBeGreaterThan(0);
    expect(body.data.capabilities.length).toBeGreaterThan(0);
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
