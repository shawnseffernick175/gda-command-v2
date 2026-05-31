import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';
process.env['ANALYSIS_TIMEOUT_MS'] ??= '500';
process.env['ANALYSIS_POLL_INTERVAL_MS'] ??= '50';

const DB_URL = process.env['DATABASE_URL'];
const { Pool } = pg;

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
        source_id BIGINT NOT NULL DEFAULT 1, created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_items (
        id BIGSERIAL PRIMARY KEY,
        opportunity_id BIGINT NOT NULL REFERENCES opportunities(id),
        capture_owner TEXT NOT NULL,
        win_probability NUMERIC CHECK (win_probability >= 0 AND win_probability <= 100),
        win_prob_evidence TEXT,
        milestone_90day TEXT,
        estimated_value NUMERIC,
        stage TEXT NOT NULL DEFAULT 'qualifying',
        source_id BIGINT NOT NULL REFERENCES sources(id),
        created_by BIGINT,
        capture_kickoff_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS capture_kickoff_at TIMESTAMPTZ
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS captures (
        id BIGSERIAL PRIMARY KEY,
        pipeline_item_id BIGINT NOT NULL REFERENCES pipeline_items(id),
        color_stage TEXT NOT NULL DEFAULT 'pink' CHECK (color_stage IN ('pink', 'red', 'gold', 'submitted')),
        capture_plan JSONB NOT NULL DEFAULT '{}',
        pricing_notes TEXT,
        compliance_status TEXT NOT NULL DEFAULT 'incomplete',
        win_themes TEXT[] NOT NULL DEFAULT '{}',
        ghost_team JSONB,
        source_id BIGINT NOT NULL DEFAULT 1 REFERENCES sources(id),
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS capture_analysis_cache (
        id BIGSERIAL PRIMARY KEY,
        capture_id BIGINT NOT NULL REFERENCES captures(id),
        version TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        pwin NUMERIC,
        UNIQUE (capture_id, version)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_items (
        id BIGSERIAL PRIMARY KEY,
        capture_id BIGINT NOT NULL REFERENCES captures(id),
        requirement TEXT NOT NULL,
        section_ref TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        response_notes TEXT,
        assigned_to TEXT,
        evidence TEXT,
        source_id BIGINT NOT NULL DEFAULT 1 REFERENCES sources(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

async function insertTestOpportunity(title: string = 'Cap_Opportunity'): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, agency, status, source_id)
     VALUES ($1, $2, 'discovery', 1) RETURNING id`,
    [title, 'Department of the Army']
  );
  return String(res.rows[0]!.id);
}

async function insertTestPipelineItem(oppId: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO pipeline_items (opportunity_id, capture_owner, source_id)
     VALUES ($1, 'shawn', 1) RETURNING id`,
    [oppId]
  );
  return String(res.rows[0]!.id);
}

async function insertTestCapture(
  pipelineItemId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const defaults = {
    color_stage: 'pink',
    capture_plan: JSON.stringify({}),
    pricing_notes: null,
    compliance_status: 'incomplete',
    win_themes: '{}',
    ghost_team: null,
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO captures (
      pipeline_item_id, color_stage, capture_plan,
      pricing_notes, compliance_status, win_themes, ghost_team, source_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id`,
    [
      pipelineItemId, data.color_stage, data.capture_plan,
      data.pricing_notes, data.compliance_status, data.win_themes, data.ghost_team,
    ]
  );
  return String(res.rows[0]!.id);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, max: 5 });
  await ensureTestSchema();
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM capture_analysis_cache');
  await pool.query('DELETE FROM compliance_items');
  await pool.query('DELETE FROM captures');
  await pool.query('DELETE FROM pipeline_items');
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'Cap_%'");
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

describe('Contract: GET /v3/captures', () => {
  it('returns paginated list with CaptureSummary fields', async () => {
    const oppId = await insertTestOpportunity('Cap_Contract List Opp');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId);

    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    expect(body.meta.source).toBe('v3');

    const data = body.data as { items: Array<Record<string, unknown>>; pagination: Record<string, unknown> };
    expect(data.items).toBeDefined();
    expect(data.pagination).toBeDefined();
    expect(data.pagination.limit).toBeDefined();
    expect(data.pagination.hasMore).toBeDefined();

    const item = data.items[0]!;
    expect(item.id).toBeDefined();
    expect(item.pipeline_item_id).toBeDefined();
    expect(item.color_stage).toBe('pink');
    expect(item.created_at).toBeDefined();
    expect(item.updated_at).toBeDefined();
  });

  it('filters by color_stage', async () => {
    const oppId = await insertTestOpportunity('Cap_Filter Opp');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId, { color_stage: 'pink' });
    await insertTestCapture(piId, { color_stage: 'red' });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures?color_stage=pink',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody;
    const data = body.data as { items: Array<Record<string, unknown>> };
    expect(data.items.length).toBe(1);
    expect(data.items[0]!.color_stage).toBe('pink');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/captures' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: GET /v3/captures/:id', () => {
  it('returns 404 for non-existent capture', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures/999999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/captures/1' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: POST /v3/captures', () => {
  it('creates capture from pipeline item and returns 201', async () => {
    const oppId = await insertTestOpportunity('Cap_Create Opp');
    const piId = await insertTestPipelineItem(oppId);

    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: piId }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.success).toBe(true);
    expect(body.data.pipeline_item_id).toBe(piId);
    expect(body.data.color_stage).toBe('pink');
  });

  it('returns 400 for missing pipeline_item_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent pipeline item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: '999999' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('sets capture_kickoff_at on pipeline item if not already set', async () => {
    const oppId = await insertTestOpportunity('Cap_Kickoff Opp');
    const piId = await insertTestPipelineItem(oppId);

    await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: piId }),
    });

    const piRes = await pool.query<{ capture_kickoff_at: string | null }>(
      'SELECT capture_kickoff_at FROM pipeline_items WHERE id = $1',
      [piId]
    );
    expect(piRes.rows[0]!.capture_kickoff_at).not.toBeNull();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: '1' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: PATCH /v3/captures/:id', () => {
  it('updates color_stage and returns 200', async () => {
    const oppId = await insertTestOpportunity('Cap_Patch Opp');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'red' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.data.color_stage).toBe('red');
  });

  it('returns 404 for non-existent capture', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/captures/999999',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'pink' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid stage', async () => {
    const oppId = await insertTestOpportunity('Cap_Invalid Stage Opp');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'invalid_stage' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/captures/1',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'pink' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Contract: SuccessEnvelope on capture endpoints', () => {
  it('all capture responses include meta with generatedAt, source, requestId', async () => {
    const oppId = await insertTestOpportunity('Cap_Envelope Opp');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId);

    const res = await app.inject({
      method: 'GET',
      url: '/v3/captures',
      headers: authHeader(),
    });
    const body = JSON.parse(res.body) as SuccessBody;
    expect(body.meta.generatedAt).toBeTruthy();
    expect(body.meta.source).toBe('v3');
    expect(body.meta.requestId).toBeTruthy();
  });
});
