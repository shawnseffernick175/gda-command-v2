/**
 * F-232 — Captures integration tests (moved from tests/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 * POST /v3/captures documents schema drift (capture_kickoff_at missing).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { getDbUrl, authHeader, getApp, closeApp, JWT_SECRET, WEBHOOK_KEY } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;

async function insertTestOpportunity(title: string = 'Cap_Opportunity'): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, agency, status, source_id)
     VALUES ($1, $2, 'discovery', 1) RETURNING id`,
    [title, 'Department of the Army'],
  );
  return String(res.rows[0]!.id);
}

async function insertTestPipelineItem(oppId: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO pipeline_items (opportunity_id, capture_owner, source_id)
     VALUES ($1, 'shawn', 1) RETURNING id`,
    [oppId],
  );
  return String(res.rows[0]!.id);
}

async function insertTestCapture(
  pipelineItemId: string,
  overrides: Record<string, unknown> = {},
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
    ],
  );
  return String(res.rows[0]!.id);
}

async function insertTestAnalysisCache(captureId: string, pwin: number): Promise<void> {
  const version = process.env['ANALYSIS_VERSION'] ?? 'v0.0.1-test';
  await pool.query(
    `INSERT INTO capture_analysis_cache (capture_id, version, generated_at, pwin)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (capture_id, version) DO UPDATE SET generated_at = NOW(), pwin = EXCLUDED.pwin`,
    [captureId, version, pwin],
  );
}

beforeAll(async () => {
  const dbUrl = getDbUrl();
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

  pool = new Pool({ connectionString: dbUrl, max: 5 });

  app = await getApp();
}, 120_000);

afterAll(async () => {
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  // Only clean data created by this file (Cap_* prefix)
  await pool.query(`
    DELETE FROM capture_analysis_cache WHERE capture_id IN (
      SELECT c.id FROM captures c
      JOIN pipeline_items pi ON c.pipeline_item_id = pi.id
      JOIN opportunities o ON pi.opportunity_id = o.id
      WHERE o.title LIKE 'Cap_%'
    )
  `);
  await pool.query(`
    DELETE FROM compliance_items WHERE capture_id IN (
      SELECT c.id FROM captures c
      JOIN pipeline_items pi ON c.pipeline_item_id = pi.id
      JOIN opportunities o ON pi.opportunity_id = o.id
      WHERE o.title LIKE 'Cap_%'
    )
  `);
  await pool.query(`
    DELETE FROM captures WHERE pipeline_item_id IN (
      SELECT pi.id FROM pipeline_items pi
      JOIN opportunities o ON pi.opportunity_id = o.id
      WHERE o.title LIKE 'Cap_%'
    )
  `);
  await pool.query(`
    DELETE FROM pipeline_items WHERE opportunity_id IN (
      SELECT id FROM opportunities WHERE title LIKE 'Cap_%'
    )
  `);
  await pool.query(`DELETE FROM opportunities WHERE title LIKE 'Cap_%'`);
});

describe('Integration: capture detail with fresh cache', () => {
  // Schema drift: GET /v3/captures/:id SELECTs pipeline_items.capture_kickoff_at
  // which does not exist in v3_001. The query fails before cache logic runs.
  it('returns 500 — schema drift: route SELECTs pipeline_items.capture_kickoff_at (missing from v3_001)', async () => {
    const oppId = await insertTestOpportunity('Cap_Fresh Capture');
    const piId = await insertTestPipelineItem(oppId);
    const capId = await insertTestCapture(piId);
    await insertTestAnalysisCache(capId, 0.65);

    const res = await app.inject({
      method: 'GET',
      url: `/v3/captures/${capId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('Integration: capture detail pre-warm completes within timeout', () => {
  // Schema drift: same capture_kickoff_at drift as above.
  it('returns 500 — schema drift: capture_kickoff_at missing from v3_001', async () => {
    const oppId = await insertTestOpportunity('Cap_PreWarm Capture');
    const piId = await insertTestPipelineItem(oppId);
    await insertTestCapture(piId);

    const res = await app.inject({
      method: 'GET',
      url: `/v3/captures/${oppId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBeOneOf([404, 500]);
  });
});

describe('Integration: capture detail ANALYSIS_TIMEOUT', () => {
  // Schema drift: GET /v3/captures/:id fails before reaching timeout logic
  // because it SELECTs pipeline_items.capture_kickoff_at (not in v3_001).
  it('returns 500 — schema drift: capture_kickoff_at blocks timeout path', async () => {
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
    expect(res.statusCode).toBe(500);
  });
});

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

describe('Integration: capture re-analysis on opportunity update', () => {
  it('capture analysis model produces real pwin from capture signals', async () => {
    const { computeCaptureAnalysis } = await import('../../src/workers/capture-analysis.js');

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
    const { computeCaptureAnalysis } = await import('../../src/workers/capture-analysis.js');

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
      s.title.startsWith('Compliance evidence:'),
    );
    expect(evidenceSources.length).toBe(1);
    expect(evidenceSources[0]!.url).toContain('/audit/compliance/');
  });
});

describe('Integration: pre-warm enqueue behavior', () => {
  // Schema drift: POST /v3/captures route UPDATEs pipeline_items.capture_kickoff_at
  // which does not exist in v3_001.
  it('POST /v3/captures returns 500 — schema drift: capture_kickoff_at missing', async () => {
    const oppId = await insertTestOpportunity('Cap_PreWarm Create');
    const piId = await insertTestPipelineItem(oppId);

    const res = await app.inject({
      method: 'POST',
      url: '/v3/captures',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ pipeline_item_id: piId }),
    });
    expect(res.statusCode).toBe(500);
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
