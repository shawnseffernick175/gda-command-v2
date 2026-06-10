/**
 * Tests for the override capture routes (Path A learning loop).
 *
 * Tests:
 *  1. POST grade override happy path
 *  2. POST grade override when no analysis cache row exists
 *  3. POST grade override no-op (same grade)
 *  4. POST grade override invalid grade → 400
 *  5. POST grade override reason > 500 chars → 400
 *  6. POST grade override nonexistent opp → 404
 *  7. POST stage override happy path with existing pipeline_items row
 *  8. POST stage override happy path with NO existing pipeline_items row
 *  9. POST stage override invalid stage → 400
 * 10. POST stage override no-op
 * 11. GET /v3/overrides/summary with zero overrides
 * 12. GET /v3/overrides/summary after seeding 5 grade overrides
 * 13. Migration: table exists, indexes exist, constraints work
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getApp,
  closeApp,
  authHeader,
  getPool,
  getSeedIds,
} from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let opportunityId: string;
let secondOppId: string;

beforeAll(async () => {
  app = await getApp();
  const pool = getPool();
  const ids = getSeedIds();
  opportunityId = ids.opportunityId;

  // Set initial grade on seed opportunity
  await pool.query(
    `UPDATE opportunities SET grade = 'F', grade_evidence = '{"test": true}' WHERE id = $1`,
    [opportunityId],
  );

  // Create a second opportunity without pipeline_items for stage override tests
  const srcRes = await pool.query<{ id: string }>(
    `SELECT id::text FROM sources LIMIT 1`,
  );
  const sourceId = srcRes.rows[0]!.id;

  const oppRes = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (title, agency, naics, status, source_id, description, set_aside, value_min, value_max, grade)
     VALUES ('Override Test Opp 2', 'DLA', '541512', 'discovery', $1, 'test', 'SDB', 100000, 500000, 'D')
     RETURNING id::text`,
    [sourceId],
  );
  secondOppId = oppRes.rows[0]!.id;
});

afterAll(async () => {
  await closeApp();
});

describe('POST /v3/opportunities/:id/override-grade', () => {
  it('1. happy path — writes override row with expected fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-grade`,
      headers: authHeader(),
      payload: { new_grade: 'B', reason: 'Strong relationship with agency' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.override_id).toBeDefined();

    // Verify the override row
    const pool = getPool();
    const row = await pool.query(
      `SELECT * FROM opportunity_decision_overrides WHERE id = $1`,
      [body.data.override_id],
    );
    expect(row.rows[0].field_name).toBe('grade');
    expect(row.rows[0].ai_value).toBe('F');
    expect(row.rows[0].human_value).toBe('B');
    expect(row.rows[0].reason).toBe('Strong relationship with agency');

    // Verify grade was updated on opportunity
    const opp = await pool.query(
      `SELECT grade FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    expect(opp.rows[0].grade).toBe('B');
  });

  it('2. works when no opportunity_analysis_cache row exists — ai fields NULL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${secondOppId}/override-grade`,
      headers: authHeader(),
      payload: { new_grade: 'A' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.override_id).toBeDefined();

    const pool = getPool();
    const row = await pool.query(
      `SELECT * FROM opportunity_decision_overrides WHERE id = $1`,
      [body.data.override_id],
    );
    expect(row.rows[0].ai_confidence).toBeNull();
    expect(row.rows[0].ai_model_version).toBeNull();
    expect(row.rows[0].ai_generated_at).toBeNull();
    expect(row.rows[0].ai_value).toBe('D');
    expect(row.rows[0].human_value).toBe('A');
  });

  it('3. no-op when new_grade === current_grade', async () => {
    // Current grade is 'B' after test 1
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-grade`,
      headers: authHeader(),
      payload: { new_grade: 'B' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.noop).toBe(true);
  });

  it('4. invalid grade returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-grade`,
      headers: authHeader(),
      payload: { new_grade: 'Z' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('5. reason > 500 chars returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-grade`,
      headers: authHeader(),
      payload: { new_grade: 'C', reason: 'x'.repeat(501) },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('6. nonexistent opportunity returns 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/opportunities/999999/override-grade',
      headers: authHeader(),
      payload: { new_grade: 'A' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /v3/opportunities/:id/override-stage', () => {
  it('7. happy path with existing pipeline_items row', async () => {
    // The seed opportunity has a pipeline_items row
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-stage`,
      headers: authHeader(),
      payload: { new_stage: 'pursue', reason: 'AI marked no_bid but we have capacity' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.override_id).toBeDefined();

    // Verify pipeline_items stage updated
    const pool = getPool();
    const pi = await pool.query(
      `SELECT stage FROM pipeline_items WHERE opportunity_id = $1 ORDER BY id DESC LIMIT 1`,
      [opportunityId],
    );
    expect(pi.rows[0].stage).toBe('pursue');
  });

  it('8. happy path with NO existing pipeline_items row — creates new row', async () => {
    // secondOppId has no pipeline_items row
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${secondOppId}/override-stage`,
      headers: authHeader(),
      payload: { new_stage: 'qualify' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.override_id).toBeDefined();

    // Verify pipeline_items row was created
    const pool = getPool();
    const pi = await pool.query(
      `SELECT stage FROM pipeline_items WHERE opportunity_id = $1`,
      [secondOppId],
    );
    expect(pi.rows.length).toBeGreaterThan(0);
    expect(pi.rows[0].stage).toBe('qualify');
  });

  it('9. invalid stage returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-stage`,
      headers: authHeader(),
      payload: { new_stage: 'invalid_stage_xyz' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('10. no-op when new_stage === current_stage', async () => {
    // Current stage is 'pursue' after test 7
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${opportunityId}/override-stage`,
      headers: authHeader(),
      payload: { new_stage: 'pursue' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.noop).toBe(true);
  });
});

describe('GET /v3/overrides/summary', () => {
  it('11. returns expected shape with data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/overrides/summary?range=all',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.totals).toBeDefined();
    expect(body.data.totals.grade_overrides).toBeGreaterThanOrEqual(0);
    expect(body.data.totals.stage_overrides).toBeGreaterThanOrEqual(0);
    expect(body.data.totals.all_time).toBeGreaterThanOrEqual(0);
    expect(body.data.totals.last_7d).toBeGreaterThanOrEqual(0);
    expect(body.data.totals.last_30d).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.data.grade_pivot)).toBe(true);
    expect(Array.isArray(body.data.stage_pivot)).toBe(true);
    expect(body.data.agreement_rate).toBeDefined();
    expect(Array.isArray(body.data.top_disagreement_naics)).toBe(true);
    expect(Array.isArray(body.data.top_disagreement_agency)).toBe(true);
    expect(Array.isArray(body.data.recent)).toBe(true);
  });

  it('12. pivot counts correct after seeded overrides', async () => {
    const pool = getPool();

    // Seed 5 additional grade overrides for variety
    const srcRes = await pool.query<{ id: string }>(
      `SELECT id::text FROM sources LIMIT 1`,
    );
    const sourceId = srcRes.rows[0]!.id;

    for (let i = 0; i < 5; i++) {
      const oppRes = await pool.query<{ id: string }>(
        `INSERT INTO opportunities (title, agency, naics, status, source_id, description, set_aside, value_min, value_max, grade)
         VALUES ($1, 'DISA', '541512', 'discovery', $2, 'test', 'SDB', 100000, 500000, 'F')
         RETURNING id::text`,
        [`Override Seed Opp ${i}`, sourceId],
      );

      await pool.query(
        `INSERT INTO opportunity_decision_overrides
         (opportunity_id, field_name, ai_value, human_value, reason)
         VALUES ($1, 'grade', 'F', 'C', 'Seeded for test')`,
        [oppRes.rows[0]!.id],
      );
    }

    const res = await app.inject({
      method: 'GET',
      url: '/v3/overrides/summary?range=all',
      headers: authHeader(),
    });

    const body = res.json();
    expect(body.data.totals.grade_overrides).toBeGreaterThanOrEqual(5);

    // Check pivot has F→C entry
    const fcEntry = body.data.grade_pivot.find(
      (p: { ai_value: string; human_value: string }) =>
        p.ai_value === 'F' && p.human_value === 'C',
    );
    expect(fcEntry).toBeDefined();
    expect(fcEntry.count).toBeGreaterThanOrEqual(5);
  });
});

describe('Migration: v3_072', () => {
  it('13. table exists with correct constraints and indexes', async () => {
    const pool = getPool();

    // Table exists
    const tableRes = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'opportunity_decision_overrides'
      ) AS exists`,
    );
    expect(tableRes.rows[0].exists).toBe(true);

    // Indexes exist
    const indexRes = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'opportunity_decision_overrides'`,
    );
    const indexNames = indexRes.rows.map((r: { indexname: string }) => r.indexname);
    expect(indexNames).toContain('idx_opp_decision_overrides_opp');
    expect(indexNames).toContain('idx_opp_decision_overrides_field_created');
    expect(indexNames).toContain('idx_opp_decision_overrides_ai_value');

    // field_name constraint
    const badFieldRes = await pool.query(
      `INSERT INTO opportunity_decision_overrides
       (opportunity_id, field_name, human_value)
       VALUES ($1, 'bad_field', 'A')`,
      [opportunityId],
    ).catch((e: Error) => e);
    expect(badFieldRes).toBeInstanceOf(Error);

    // reason length constraint
    const longReasonRes = await pool.query(
      `INSERT INTO opportunity_decision_overrides
       (opportunity_id, field_name, human_value, reason)
       VALUES ($1, 'grade', 'A', $2)`,
      [opportunityId, 'x'.repeat(501)],
    ).catch((e: Error) => e);
    expect(longReasonRes).toBeInstanceOf(Error);
  });
});
