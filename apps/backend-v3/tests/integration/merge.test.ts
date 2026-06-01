/**
 * F-405: Integration tests for merge endpoint.
 *
 * Tests the merged view endpoint against a seeded set of cross-source
 * opportunities with GovWin, SAM, GovTribe, and Fast Track links.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { getDbUrl, authHeader, getApp, closeApp } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let sourceId: string;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  pool = new Pool({ connectionString: dbUrl, max: 5 });

  app = await getApp();

  // Ensure a source row exists for FK references
  const srcRes = await pool.query<{ id: string }>(
    `INSERT INTO sources (kind, title, retrieved_at, confidence)
     VALUES ('internal', 'Merge test source', NOW(), 'high')
     RETURNING id::text`,
  );
  sourceId = srcRes.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await closeApp();
  if (pool) await pool.end();
}, 30_000);

beforeEach(async () => {
  // Clean merge-related test data
  await pool.query(`DELETE FROM merged_opportunity_cache WHERE opportunity_id IN (
    SELECT id FROM opportunities WHERE title LIKE 'Merge Test%'
  )`);
  await pool.query(`DELETE FROM opportunity_field_overrides WHERE opportunity_id IN (
    SELECT id FROM opportunities WHERE title LIKE 'Merge Test%'
  )`);
  await pool.query(`DELETE FROM opportunity_links WHERE opportunity_id IN (
    SELECT id FROM opportunities WHERE title LIKE 'Merge Test%'
  )`);
  await pool.query(`DELETE FROM opportunities WHERE title LIKE 'Merge Test%'`);
});

async function insertOpp(title: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const defaults = {
    agency: 'Department of the Army',
    status: 'discovery',
    source_id: sourceId,
    value_max: 5000000,
    response_due_at: '2026-09-01T00:00:00Z',
  };
  const data = { ...defaults, ...overrides };
  const res = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, agency, status, source_id, value_max, response_due_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
    [title, data.agency, data.status, data.source_id, data.value_max, data.response_due_at],
  );
  return res.rows[0]!.id;
}

async function insertLink(
  oppId: string,
  sourceType: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO opportunity_links (opportunity_id, source_type, source_record_id, snapshot)
     VALUES ($1, $2, $3, $4)`,
    [oppId, sourceType, `${sourceType}-${oppId}`, JSON.stringify(snapshot)],
  );
}

async function insertOverride(
  oppId: string,
  field: string,
  value: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO opportunity_field_overrides (opportunity_id, field_name, field_value, set_by)
     VALUES ($1, $2, $3, 'test-user')`,
    [oppId, field, value],
  );
}

describe('Integration: GET /v3/opportunities/:id/merged', () => {
  it('returns 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/999999/merged',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns base row when no links or overrides exist', async () => {
    const id = await insertOpp('Merge Test — Base Only');

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.internal_id).toBe(id);

    const title = body.data.title as { value: string; source: string };
    expect(title.value).toBe('Merge Test — Base Only');
    expect(title.source).toBe('base');
  });

  it('merges GovWin + SAM + GovTribe correctly', async () => {
    const id = await insertOpp('Merge Test — Cross-Source');

    await insertLink(id, 'govwin', {
      title: 'GovWin Title',
      agency: 'DoD via GovWin',
      estimated_value_cents: 10000000,
      response_due_at: '2026-10-01T00:00:00Z',
    });
    await insertLink(id, 'sam', {
      title: 'SAM Title',
      agency: 'DoD via SAM',
      estimated_value_cents: 9000000,
      response_due_at: '2026-09-15T00:00:00Z',
    });
    await insertLink(id, 'govtribe', {
      title: 'GovTribe Title',
      estimated_value_cents: 8000000,
      response_due_at: '2026-09-20T00:00:00Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Record<string, unknown> };
    const data = body.data;

    // title: GovWin wins (default precedence)
    const title = data.title as { value: string; source: string };
    expect(title.value).toBe('GovWin Title');
    expect(title.source).toBe('govwin');

    // response_due_at: SAM wins (SAM authoritative for federal)
    const dueAt = data.response_due_at as { value: string; source: string };
    expect(dueAt.value).toBe('2026-09-15T00:00:00Z');
    expect(dueAt.source).toBe('sam');

    // estimated_value_cents: GovWin > SAM > GovTribe
    const value = data.estimated_value_cents as { value: number; source: string };
    expect(value.value).toBe(10000000);
    expect(value.source).toBe('govwin');
  });

  it('human override on agency beats all sources', async () => {
    const id = await insertOpp('Merge Test — Override');

    await insertLink(id, 'govwin', { agency: 'GovWin Agency' });
    await insertLink(id, 'sam', { agency: 'SAM Agency' });
    await insertOverride(id, 'agency', 'Envision Manual Override');

    const res = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Record<string, unknown> };
    const agency = body.data.agency as { value: string; source: string };
    expect(agency.value).toBe('Envision Manual Override');
    expect(agency.source).toBe('override');
  });

  it('cache is hit on second request within 60s', async () => {
    const id = await insertOpp('Merge Test — Cache');

    // First request populates cache
    const res1 = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });
    expect(res1.statusCode).toBe(200);
    const data1 = JSON.parse(res1.body) as { data: { merged_at: string } };

    // Second request should be cached (same merged_at)
    const res2 = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });
    expect(res2.statusCode).toBe(200);
    const data2 = JSON.parse(res2.body) as { data: { merged_at: string } };

    expect(data2.data.merged_at).toBe(data1.data.merged_at);
  });
});

describe('Integration: PUT /v3/opportunities/:id/overrides', () => {
  it('sets a field override and invalidates cache', async () => {
    const id = await insertOpp('Merge Test — Override API');

    // Populate cache
    await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });

    // Set override
    const overrideRes = await app.inject({
      method: 'PUT',
      url: `/v3/opportunities/${id}/overrides`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        field_name: 'agency',
        field_value: 'New Override Agency',
      }),
    });
    expect(overrideRes.statusCode).toBe(200);
    const overrideBody = JSON.parse(overrideRes.body) as {
      data: { field_name: string; field_value: string };
    };
    expect(overrideBody.data.field_name).toBe('agency');
    expect(overrideBody.data.field_value).toBe('New Override Agency');

    // Merged view should now reflect the override (cache was invalidated)
    const mergedRes = await app.inject({
      method: 'GET',
      url: `/v3/opportunities/${id}/merged`,
      headers: authHeader(),
    });
    expect(mergedRes.statusCode).toBe(200);
    const mergedBody = JSON.parse(mergedRes.body) as { data: Record<string, unknown> };
    const agency = mergedBody.data.agency as { value: string; source: string };
    expect(agency.value).toBe('New Override Agency');
    expect(agency.source).toBe('override');
  });

  it('returns 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v3/opportunities/999999/overrides',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ field_name: 'agency', field_value: 'test' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when field_name is missing', async () => {
    const id = await insertOpp('Merge Test — Override Validation');

    const res = await app.inject({
      method: 'PUT',
      url: `/v3/opportunities/${id}/overrides`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({ field_value: 'test' }),
    });
    expect(res.statusCode).toBe(400);
  });
});
