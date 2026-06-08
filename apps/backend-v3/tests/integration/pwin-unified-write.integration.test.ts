/**
 * Integration test: batchScoreOpportunities writes numeric pwin
 * into unified_opportunities via the link-resolved UPDATE.
 *
 * Uses the testcontainer Postgres pattern (globalSetup -> setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { getDbUrl, getSeedIds } from './helpers.js';
import type { SeedIds } from './seed.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let ids: SeedIds;
let sourceId: number;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  ids = getSeedIds();

  process.env['JWT_SECRET'] = 'test-jwt-secret-integration';
  process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key-integration';
  process.env['DATABASE_URL'] = dbUrl;
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';
  process.env['LLM_ROUTER_MODE'] = 'mock';

  pool = new Pool({ connectionString: dbUrl, max: 5 });

  const { rows: srcRows } = await pool.query(
    `INSERT INTO sources (kind, title, retrieved_at, confidence)
     VALUES ('internal', 'pwin-unified-write integration test', NOW(), 'high')
     RETURNING id`,
  );
  sourceId = srcRows[0].id;
}, 120_000);

afterAll(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM unified_opportunity_links WHERE source_native_id IN ('PWIN-UNIFIED-SAM-001', 'PWIN-UNIFIED-SAM-002')`,
    );
    await pool.query(
      `DELETE FROM opportunities WHERE sam_notice_id IN ('PWIN-UNIFIED-SAM-001', 'PWIN-UNIFIED-SAM-002')`,
    );
    await pool.end();
  }
}, 30_000);

describe('batchScoreOpportunities unified pwin write', () => {
  it('writes numeric pwin into unified_opportunities for a far-future opp', async () => {
    const { mirrorOpportunityToUnified } = await import(
      '../../src/services/opportunities/unified-mirror.js'
    );
    const { batchScoreOpportunities } = await import(
      '../../src/services/pwin/batch-score.js'
    );

    // Insert a SAM legacy row with far-future deadline (will score numerically)
    await pool.query(
      `INSERT INTO opportunities (
         title, agency, naics, set_aside, value_min, value_max,
         response_due_at, posted_at,
         sam_notice_id, data_source, status, source_id, description
       ) VALUES (
         'Pwin Unified Test Opp', 'Department of the Army', '541330',
         NULL, 5000000, 10000000,
         '2027-06-01T00:00:00Z', '2026-01-01T00:00:00Z',
         'PWIN-UNIFIED-SAM-001', 'sam.gov', 'discovery', $1,
         'Test opportunity for pwin unified write'
       ) ON CONFLICT (sam_notice_id) DO NOTHING`,
      [sourceId],
    );

    // Get the legacy row
    const { rows: legacyRows } = await pool.query(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities WHERE sam_notice_id = 'PWIN-UNIFIED-SAM-001'`,
    );
    const legacy = legacyRows[0];
    const oppId = legacy.id;

    // Mirror to unified so the link exists
    const mirrorResult = await mirrorOpportunityToUnified(pool, legacy);
    expect(mirrorResult.created).toBe(true);
    expect(mirrorResult.internal_id).toBeTruthy();

    // Confirm unified pwin is NULL before scoring
    const { rows: preScoringRows } = await pool.query(
      `SELECT pwin FROM unified_opportunities WHERE internal_id = $1`,
      [mirrorResult.internal_id],
    );
    expect(preScoringRows[0].pwin).toBeNull();

    // Run batch scoring for this specific opportunity
    const result = await batchScoreOpportunities({ ids: [Number(oppId)] });
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Assert unified_opportunities.pwin is now non-null and equals the rounded score
    const { rows: postScoringRows } = await pool.query(
      `SELECT pwin FROM unified_opportunities WHERE internal_id = $1`,
      [mirrorResult.internal_id],
    );
    expect(postScoringRows[0].pwin).not.toBeNull();
    expect(typeof postScoringRows[0].pwin).toBe('number');
    expect(postScoringRows[0].pwin).toBeGreaterThanOrEqual(0);
    expect(postScoringRows[0].pwin).toBeLessThanOrEqual(100);

    // Verify the legacy analysis.pwin was also written (existing behavior)
    const { rows: analysisRows } = await pool.query(
      `SELECT analysis->'pwin'->>'score' AS pwin_score
       FROM opportunities WHERE id = $1`,
      [oppId],
    );
    const legacyScore = Number(analysisRows[0].pwin_score);
    expect(postScoringRows[0].pwin).toBe(Math.round(legacyScore));
  });

  it('does not overwrite unified pwin for a within-30-days opp (pass band)', async () => {
    const { mirrorOpportunityToUnified } = await import(
      '../../src/services/opportunities/unified-mirror.js'
    );
    const { batchScoreOpportunities } = await import(
      '../../src/services/pwin/batch-score.js'
    );

    // Insert a SAM legacy row with deadline within 30 days (will get pass band)
    const nearDeadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await pool.query(
      `INSERT INTO opportunities (
         title, agency, naics, set_aside, value_min, value_max,
         response_due_at, posted_at,
         sam_notice_id, data_source, status, source_id, description
       ) VALUES (
         'Pwin Unified Near Deadline Opp', 'Department of the Army', '541330',
         NULL, 2000000, 5000000,
         $1, '2026-01-01T00:00:00Z',
         'PWIN-UNIFIED-SAM-002', 'sam.gov', 'discovery', $2,
         'Test opportunity with near deadline for pass band'
       ) ON CONFLICT (sam_notice_id) DO NOTHING`,
      [nearDeadline, sourceId],
    );

    const { rows: legacyRows } = await pool.query(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities WHERE sam_notice_id = 'PWIN-UNIFIED-SAM-002'`,
    );
    const legacy = legacyRows[0];
    const oppId = legacy.id;

    // Mirror to unified
    const mirrorResult = await mirrorOpportunityToUnified(pool, legacy);
    expect(mirrorResult.created).toBe(true);

    // Set a pre-existing pwin value to verify it is not overwritten
    await pool.query(
      `UPDATE unified_opportunities SET pwin = 42 WHERE internal_id = $1`,
      [mirrorResult.internal_id],
    );

    // Run batch scoring
    const result = await batchScoreOpportunities({ ids: [Number(oppId)] });
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.passed).toBeGreaterThanOrEqual(1);

    // Verify the legacy analysis shows pass band
    const { rows: analysisRows } = await pool.query(
      `SELECT analysis->'pwin'->>'band' AS band,
             analysis->'pwin'->>'score' AS score
       FROM opportunities WHERE id = $1`,
      [oppId],
    );
    expect(analysisRows[0].band).toBe('pass');
    expect(analysisRows[0].score).toBeNull();

    // unified pwin should be untouched (still 42)
    const { rows: unifiedRows } = await pool.query(
      `SELECT pwin FROM unified_opportunities WHERE internal_id = $1`,
      [mirrorResult.internal_id],
    );
    expect(unifiedRows[0].pwin).toBe(42);
  });
});
