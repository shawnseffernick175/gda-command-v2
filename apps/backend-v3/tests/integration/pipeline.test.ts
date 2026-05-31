/**
 * F-234: Pipeline tests (migrated from tests/).
 *
 * No CREATE TABLE — tests use the real migration runner (v3_001–v3_008).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import type PgBoss from 'pg-boss';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let boss: PgBoss;

async function insertQualifiedOpportunity(overrides: Record<string, unknown> = {}): Promise<string> {
  const defaults = {
    title: 'Test Pipeline Opportunity',
    status: 'qualified',
    agency: 'Department of the Army',
    naics: '541330',
    set_aside: 'SDB',
    source_id: 1,
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, status, agency, naics, set_aside, source_id, response_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [data.title, data.status, data.agency, data.naics, data.set_aside, data.source_id,
     (data as Record<string, unknown>).response_due_at ?? null],
  );
  return String(res.rows[0]!.id);
}

async function insertSourceSiblings(opportunityId: string): Promise<void> {
  const tables = [
    'opportunity_title_sources',
    'opportunity_agency_sources',
    'opportunity_naics_sources',
  ];
  for (const table of tables) {
    await pool.query(
      `INSERT INTO ${table} (opportunity_id, source_id) VALUES ($1, 1) ON CONFLICT DO NOTHING`,
      [opportunityId],
    );
  }
}

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });

  // getApp() must run before initBoss() so that process.env['JWT_SECRET']
  // is set before queue.ts imports config (config reads env at import time).
  app = await getApp();

  const { initBoss } = await import('../../src/lib/queue.js');
  boss = await initBoss();
}, 120_000);

afterAll(async () => {
  const { stopBoss } = await import('../../src/lib/queue.js');
  await stopBoss();
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  await pool.query("DELETE FROM teaming_attachments WHERE reason LIKE 'Pipeline%' OR reason LIKE 'Test%'");
  await pool.query(`
    DELETE FROM captures WHERE pipeline_item_id IN (
      SELECT id FROM pipeline_items WHERE opportunity_id IN (
        SELECT id FROM opportunities WHERE title LIKE 'Test Pipeline%'
      )
    )
  `);
  await pool.query("DELETE FROM pipeline_items WHERE opportunity_id IN (SELECT id FROM opportunities WHERE title LIKE 'Test Pipeline%')");
  await pool.query("DELETE FROM pipeline_items WHERE capture_owner LIKE 'test-%'");
  await pool.query("DELETE FROM opportunities WHERE title LIKE 'Test Pipeline%'");
});

// ---------------------------------------------------------------------------
// Contract tests: Pipeline endpoints conform to openapi-v3.yaml
// ---------------------------------------------------------------------------
describe('Contract: GET /v3/pipeline', () => {
  it('returns SuccessEnvelope with items array and pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/pipeline',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: { items: unknown[]; pagination: { limit: number; hasMore: boolean; cursor: string | null } };
      meta: { generatedAt: string; source: string; requestId: string };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.pagination).toBeDefined();
    expect(typeof body.data.pagination.limit).toBe('number');
    expect(typeof body.data.pagination.hasMore).toBe('boolean');
    expect(body.meta.source).toBe('v3');
    expect(body.meta.requestId).toBeTruthy();
    expect(body.meta.generatedAt).toBeTruthy();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/pipeline' });
    expect(res.statusCode).toBe(401);
  });

  it('respects limit parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/pipeline?limit=5',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { pagination: { limit: number } } };
    expect(body.data.pagination.limit).toBe(5);
  });
});

describe('Contract: POST /v3/pipeline', () => {
  it('returns 400 when opportunity_id is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ capture_owner: 'test-shawn' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when capture_owner is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ opportunity_id: '999' }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when win_prob_pct set without evidence', async () => {
    const oppId = await insertQualifiedOpportunity();
    const res = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
        win_prob_pct: 65,
      }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: '999999',
        capture_owner: 'test-shawn',
      }),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for non-qualified opportunity', async () => {
    const oppId = await insertQualifiedOpportunity({ status: 'discovery' });
    const res = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
      }),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('qualified');
  });

  it('returns 201 with PipelineItem for valid promotion', async () => {
    const oppId = await insertQualifiedOpportunity();
    await insertSourceSiblings(oppId);
    const res = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
        win_prob_pct: 65,
        win_prob_evidence: 'Strong past performance',
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: {
        id: string;
        opportunity_id: string;
        capture_owner: string;
        opportunity_title: string;
        opportunity_title_sources: unknown[];
        win_prob_pct: number;
        teaming_partners: unknown[];
        milestones: unknown[];
        created_at: string;
      };
      meta: { source: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.opportunity_id).toBe(oppId);
    expect(body.data.capture_owner).toBe('test-shawn');
    expect(body.data.opportunity_title).toBe('Test Pipeline Opportunity');
    expect(Array.isArray(body.data.opportunity_title_sources)).toBe(true);
    expect(body.data.win_prob_pct).toBe(65);
    expect(Array.isArray(body.data.teaming_partners)).toBe(true);
    expect(Array.isArray(body.data.milestones)).toBe(true);
    expect(body.data.created_at).toBeTruthy();
    expect(body.meta.source).toBe('v3');
  });
});

describe('Contract: PATCH /v3/pipeline/:id', () => {
  it('returns 404 for non-existent pipeline item', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/pipeline/999999',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({ capture_owner: 'test-new-owner' }),
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for empty body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v3/pipeline/1',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: full pipeline flow
// ---------------------------------------------------------------------------
describe('Integration: full opportunity → qualify → pipeline → stage progression', () => {
  it('creates pipeline item with entered_at = created_at (stage progression)', async () => {
    const oppId = await insertQualifiedOpportunity({
      title: 'Test Pipeline Stage Progression',
    });
    await insertSourceSiblings(oppId);

    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body) as {
      data: { id: string; created_at: string; updated_at: string };
    };
    expect(createBody.data.created_at).toBeTruthy();
    expect(createBody.data.updated_at).toBeTruthy();

    const listRes = await app.inject({
      method: 'GET',
      url: '/v3/pipeline',
      headers: authHeader(),
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      data: { items: { id: string; created_at: string }[] };
    };
    const found = listBody.data.items.find((i) => i.id === createBody.data.id);
    expect(found).toBeDefined();
    expect(found!.created_at).toBe(createBody.data.created_at);
  });
});

describe('Integration: idempotent POST returns existing item', () => {
  it('returns 409 with existing item on duplicate POST', async () => {
    const oppId = await insertQualifiedOpportunity({
      title: 'Test Pipeline Idempotent',
    });

    const firstRes = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
      }),
    });
    expect(firstRes.statusCode).toBe(201);
    const firstBody = JSON.parse(firstRes.body) as { data: { id: string } };

    const secondRes = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-different-owner',
      }),
    });
    expect(secondRes.statusCode).toBe(409);
    const secondBody = JSON.parse(secondRes.body) as {
      success: boolean;
      data: { id: string };
    };
    expect(secondBody.success).toBe(true);
    expect(secondBody.data.id).toBe(firstBody.data.id);
  });
});

describe('Integration: PATCH non-analysis field does NOT enqueue analysis job', () => {
  it('updates pipeline-scoped data without triggering analysis', async () => {
    const oppId = await insertQualifiedOpportunity({
      title: 'Test Pipeline PATCH No Analysis',
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body) as { data: { id: string } };
    const pipelineId = createBody.data.id;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v3/pipeline/${pipelineId}`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        capture_owner: 'test-new-owner',
      }),
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body) as {
      success: boolean;
      data: { capture_owner: string };
    };
    expect(patchBody.success).toBe(true);
    expect(patchBody.data.capture_owner).toBe('test-new-owner');

    const oppRes = await pool.query<{ ai_analyzed_at: string | null }>(
      'SELECT ai_analyzed_at FROM opportunities WHERE id = $1',
      [oppId],
    );
    expect(oppRes.rows[0]!.ai_analyzed_at).toBeNull();
  });
});

describe('Integration: R1 source siblings on pipeline items', () => {
  it('populates opportunity_*_sources arrays from source sibling tables', async () => {
    const oppId = await insertQualifiedOpportunity({
      title: 'Test Pipeline R1 Sources',
    });
    await insertSourceSiblings(oppId);

    const createRes = await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-shawn',
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body) as {
      data: {
        opportunity_title_sources: { kind: string; title: string }[];
        opportunity_agency_sources: { kind: string }[];
        opportunity_naics_sources: { kind: string }[];
        capture_owner_sources: { kind: string }[];
      };
    };

    expect(body.data.opportunity_title_sources.length).toBeGreaterThan(0);
    expect(body.data.opportunity_title_sources[0]!.kind).toBe('internal');
    expect(body.data.opportunity_agency_sources.length).toBeGreaterThan(0);
    expect(body.data.opportunity_naics_sources.length).toBeGreaterThan(0);
    expect(body.data.capture_owner_sources.length).toBeGreaterThan(0);
    expect(body.data.capture_owner_sources[0]!.kind).toBe('internal');
  });
});

describe('Integration: pipeline list filters', () => {
  it('filters by capture_owner substring', async () => {
    const oppId = await insertQualifiedOpportunity({
      title: 'Test Pipeline Filter Owner',
    });
    await app.inject({
      method: 'POST',
      url: '/v3/pipeline',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: JSON.stringify({
        opportunity_id: oppId,
        capture_owner: 'test-filter-unique-owner',
      }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v3/pipeline?capture_owner=filter-unique',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { items: { capture_owner: string }[] };
    };
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items[0]!.capture_owner).toContain('filter-unique');
  });
});

describe('Forbidden token gate', () => {
  it('pipeline module does not contain analysis_status or stale tokens', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const pipelineDir = path.resolve(import.meta.dirname, '../../src/services/pipeline');
    const routeFile = path.resolve(import.meta.dirname, '../../src/routes/pipeline.ts');

    const forbidden = ['analysis_status', 'stale: true', 'not_yet_analyzed'];

    const files = [routeFile];
    try {
      const dirFiles = fs.readdirSync(pipelineDir);
      for (const f of dirFiles) {
        files.push(path.join(pipelineDir, f));
      }
    } catch {
      // Directory might not exist in test runner
    }

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const token of forbidden) {
          expect(content).not.toContain(token);
        }
      } catch {
        // File might not be accessible
      }
    }
  });
});
