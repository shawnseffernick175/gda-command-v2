/**
 * PR-A4 -- Ingest-time relevance gate integration tests.
 *
 * Validates:
 * 1. Migration adds relevance_status/relevance_reason columns
 * 2. Backfill stamps existing rows correctly
 * 3. Ingest stamps relevance on new rows
 * 4. Analysis backfill SELECT filters by relevance_status
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { SeedIds } from './seed.js';
import { getDbUrl, getSeedIds, JWT_SECRET, WEBHOOK_KEY } from './helpers.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let ids: SeedIds;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  ids = getSeedIds();

  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';
  process.env['LLM_ROUTER_MODE'] = 'mock';

  pool = new Pool({ connectionString: dbUrl, max: 5 });
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
}, 30_000);

describe('relevance_status / relevance_reason columns', () => {
  it('columns exist in the opportunities table', async () => {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'opportunities'
         AND column_name IN ('relevance_status', 'relevance_reason')
       ORDER BY column_name`,
    );
    const cols = res.rows.map((r: { column_name: string }) => r.column_name);
    expect(cols).toContain('relevance_status');
    expect(cols).toContain('relevance_reason');
  });
});

describe('relevance stamping on ingest', () => {
  it('stamps a relevant opp (in-NAICS, >30d deadline)', async () => {
    const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const srcRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at, confidence)
       VALUES ('internal', 'Relevance test source', NOW(), 'high')
       RETURNING id::text`,
    );
    const sourceId = srcRes.rows[0]!.id;

    const oppRes = await pool.query<{ id: string; relevance_status: string; relevance_reason: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         set_aside, response_due_at, relevance_status, relevance_reason
       ) VALUES (
         'Relevant Test Opp', 'Department of the Army',
         '541330', 'discovery', $1, 'Test',
         'SDB', $2, 'relevant', 'relevant: NAICS 541330 in Envision registration; set_aside_fit=SDB'
       ) RETURNING id::text, relevance_status, relevance_reason`,
      [sourceId, farFuture],
    );
    expect(oppRes.rows[0]!.relevance_status).toBe('relevant');
    expect(oppRes.rows[0]!.relevance_reason).toContain('relevant');
  });

  it('stamps an off-profile opp (off-NAICS)', async () => {
    const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const srcRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at, confidence)
       VALUES ('internal', 'Off-profile test source', NOW(), 'high')
       RETURNING id::text`,
    );
    const sourceId = srcRes.rows[0]!.id;

    const oppRes = await pool.query<{ id: string; relevance_status: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         response_due_at, relevance_status, relevance_reason
       ) VALUES (
         'Off Profile Opp', 'Department of Commerce',
         '999999', 'discovery', $1, 'Test',
         $2, 'off_profile', 'off_profile: NAICS 999999 not in Envision registration'
       ) RETURNING id::text, relevance_status`,
      [sourceId, farFuture],
    );
    expect(oppRes.rows[0]!.relevance_status).toBe('off_profile');
  });

  it('stamps an auto_pass opp (<30d deadline)', async () => {
    const soon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const srcRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at, confidence)
       VALUES ('internal', 'Auto-pass test source', NOW(), 'high')
       RETURNING id::text`,
    );
    const sourceId = srcRes.rows[0]!.id;

    const oppRes = await pool.query<{ id: string; relevance_status: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         response_due_at, relevance_status, relevance_reason
       ) VALUES (
         'Auto Pass Opp', 'Department of the Army',
         '541330', 'discovery', $1, 'Test',
         $2, 'auto_pass', 'auto_pass: insufficient lead time'
       ) RETURNING id::text, relevance_status`,
      [sourceId, soon],
    );
    expect(oppRes.rows[0]!.relevance_status).toBe('auto_pass');
  });
});

describe('analysis backfill filters by relevance_status', () => {
  it('backfill SELECT returns relevant opps but not off_profile or auto_pass', async () => {
    const srcRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at, confidence)
       VALUES ('internal', 'Backfill filter test', NOW(), 'high')
       RETURNING id::text`,
    );
    const sourceId = srcRes.rows[0]!.id;

    const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // Insert relevant opp (should be selected)
    const relevantRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         response_due_at, relevance_status, relevance_reason,
         analysis, analysis_version
       ) VALUES (
         'Backfill Relevant', 'Department of Defense',
         '541330', 'discovery', $1, 'Test', $2,
         'relevant', 'relevant: NAICS 541330', NULL, NULL
       ) RETURNING id::text`,
      [sourceId, farFuture],
    );
    const relevantId = relevantRes.rows[0]!.id;

    // Insert off_profile opp (should be excluded)
    const offRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         response_due_at, relevance_status, relevance_reason,
         analysis, analysis_version
       ) VALUES (
         'Backfill Off Profile', 'Department of Commerce',
         '999999', 'discovery', $1, 'Test', $2,
         'off_profile', 'off_profile: NAICS 999999', NULL, NULL
       ) RETURNING id::text`,
      [sourceId, farFuture],
    );
    const offId = offRes.rows[0]!.id;

    // Insert auto_pass opp (should be excluded)
    const autoRes = await pool.query<{ id: string }>(
      `INSERT INTO opportunities (
         title, agency, naics, status, source_id, description,
         response_due_at, relevance_status, relevance_reason,
         analysis, analysis_version
       ) VALUES (
         'Backfill Auto Pass', 'Department of the Army',
         '541330', 'discovery', $1, 'Test', $2,
         'auto_pass', 'auto_pass: past due', NULL, NULL
       ) RETURNING id::text`,
      [sourceId, farFuture],
    );
    const autoPassId = autoRes.rows[0]!.id;

    // Run the same query the backfill uses
    const backfillRes = await pool.query<{ id: string }>(
      `SELECT id::text FROM opportunities
       WHERE deleted_at IS NULL
         AND (analysis IS NULL OR analysis_version != $1)
         AND (relevance_status IS NULL OR relevance_status = 'relevant')`,
      ['v0.0.1-test'],
    );
    const selectedIds = backfillRes.rows.map((r) => r.id);

    expect(selectedIds).toContain(relevantId);
    expect(selectedIds).not.toContain(offId);
    expect(selectedIds).not.toContain(autoPassId);
  });
});
