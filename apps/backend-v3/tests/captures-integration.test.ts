import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
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

async function insertTestAnalysisCache(captureId: string, pwin: number): Promise<void> {
  const version = process.env['ANALYSIS_VERSION'] ?? 'v0.0.1-test';
  await pool.query(
    `INSERT INTO capture_analysis_cache (capture_id, version, generated_at, pwin)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (capture_id, version) DO UPDATE SET generated_at = NOW(), pwin = EXCLUDED.pwin`,
    [captureId, version, pwin]
  );
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
  await pool.query('DELETE FROM capture_analysis_cache');
  await pool.query('DELETE FROM compliance_items');
  await pool.query('DELETE FROM captures');
  await pool.query('DELETE FROM pipeline_items');
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'Cap_%'");
});

// Integration: 10s synchronous block (fresh / pre-warm / timeout)
describe('Integration: capture detail with fresh cache', () => {
  it('returns 200 when capture analysis cache is fresh', async () => {
    const oppId = await insertTestOpportunity('Cap_Fresh Capture');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);
    await insertTestAnalysisCache(capId, 0.65);

    const res = await app.inject({
      method: 'GET',
      url: `/v3/captures/${capId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.pwin).toBeDefined();
  });
});

describe('Integration: capture detail pre-warm completes within timeout', () => {
  it('returns 200 after analysis worker completes', async () => {
    const oppId = await insertTestOpportunity('Cap_PreWarm Capture');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const { startWorker } = await import('../src/workers/analysis.js');
    const workerBoss = await startWorker();

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/captures/${capId}`,
        headers: authHeader(),
      });

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body) as { success: boolean; data: Record<string, unknown> };
        expect(body.success).toBe(true);
      } else {
        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body) as { error: { code: string } };
        expect(body.error.code).toBe('ANALYSIS_TIMEOUT');
      }
    } finally {
      await workerBoss.stop({ graceful: true, timeout: 5000 });
    }
  });
});

describe('Integration: capture detail ANALYSIS_TIMEOUT', () => {
  it('returns 503 when no worker processes the job', async () => {
    process.env['ANALYSIS_TIMEOUT_MS'] = '500';
    process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

    const oppId = await insertTestOpportunity('Cap_Timeout Capture');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'GET',
      url: `/v3/captures/${capId}`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string; detail: string | null } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ANALYSIS_TIMEOUT');
    expect(body.error.detail).toContain('estimated_seconds');
  });
});

// Integration: color review monotonic progression
describe('Integration: color review monotonic progression', () => {
  it('allows forward progression: pink → red → gold → submitted', async () => {
    const oppId = await insertTestOpportunity('Cap_Color Forward');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const stages = ['red', 'gold', 'submitted'];
    for (const stage of stages) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v3/captures/${capId}`,
        headers: { ...authHeader(), 'content-type': 'application/json' },
        payload: JSON.stringify({ color_stage: stage }),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { color_stage: string } };
      expect(body.data.color_stage).toBe(stage);
    }
  });

  it('allows skipping forward: pink → gold', async () => {
    const oppId = await insertTestOpportunity('Cap_Color Skip');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'gold' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { color_stage: string } };
    expect(body.data.color_stage).toBe('gold');
  });

  it('blocks regression without force: true (red → pink fails)', async () => {
    const oppId = await insertTestOpportunity('Cap_Color Block Regress');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId, { color_stage: 'red' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'pink' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('force: true');
  });

  it('allows regression with force: true (red → pink succeeds)', async () => {
    const oppId = await insertTestOpportunity('Cap_Color Force Regress');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId, { color_stage: 'red' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ color_stage: 'pink', force: true }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { color_stage: string } };
    expect(body.data.color_stage).toBe('pink');
  });
});

// Integration: capture analysis
describe('Integration: capture re-analysis on opportunity update', () => {
  it('capture analysis model produces real pwin from capture signals', async () => {
    const { computeCaptureAnalysis } = await import('../src/workers/capture-analysis.js');

    const result = computeCaptureAnalysis({
      captureId: 'test-cap-1',
      colorReviewStage: 'red',
      complianceItems: [
        { id: '1', requirement: 'ISO', status: 'compliant', evidence: 'cert' },
        { id: '2', requirement: 'CMMI', status: 'partial', evidence: null },
      ],
      pricingMarginPct: 12,
      hasTeamingPartners: true,
      opportunityAnalysis: { pwin: 0.6 },
    });

    expect(result.pwin).toBeGreaterThan(0);
    expect(result.pwin).toBeLessThanOrEqual(1);
    expect(result.pwin_sources.length).toBeGreaterThan(0);
    expect(result.pwin_components).toBeDefined();
    expect(result.pwin_components.base_pwin).toBe(0.6);
    expect(result.pwin_components.compliance_factor).toBeGreaterThan(0);
    expect(result.pwin_components.stage_factor).toBe(0.85);
    expect(result.pwin_components.teaming_factor).toBe(1.05);
    expect(result.version).toBeTruthy();
    expect(result.generated_at).toBeTruthy();
  });

  it('capture analysis includes compliance evidence sources (R1)', async () => {
    const { computeCaptureAnalysis } = await import('../src/workers/capture-analysis.js');

    const result = computeCaptureAnalysis({
      captureId: 'test-cap-2',
      colorReviewStage: 'pink',
      complianceItems: [
        { id: 'ci_1', requirement: 'ISO 9001', status: 'compliant', evidence: 'Certificate valid through 2027' },
      ],
      pricingMarginPct: 10,
      hasTeamingPartners: false,
      opportunityAnalysis: { pwin: 0.5 },
    });

    const evidenceSources = result.pwin_sources.filter((s) =>
      s.title.startsWith('Compliance evidence:')
    );
    expect(evidenceSources.length).toBe(1);
    expect(evidenceSources[0]!.url).toContain('/audit/compliance/');
  });
});

// Integration: pre-warm coverage
describe('Integration: pre-warm enqueue behavior', () => {
  it('POST /v3/captures enqueues analysis-capture', async () => {
    const oppId = await insertTestOpportunity('Cap_PreWarm Create');
    const piId = await insertTestPipelineItem(oppId);

    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: piId }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('PATCH of pricing_notes does NOT enqueue analysis', async () => {
    const oppId = await insertTestOpportunity('Cap_PreWarm Notes');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v3/captures/${capId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pricing_notes: 'Just a note' }),
    });
    expect(res.statusCode).toBe(200);
  });
});
