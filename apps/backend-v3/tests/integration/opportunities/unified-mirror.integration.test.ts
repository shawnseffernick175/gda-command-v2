/**
 * Integration test for mirrorOpportunityToUnified (F-401).
 *
 * Uses the testcontainer Postgres pattern (globalSetup -> setup.ts).
 * Seeds legacy opportunity rows for SAM, GovTribe, and arxiv, calls
 * mirrorOpportunityToUnified, and asserts:
 *   - unified_opportunities row created with correct mapped fields
 *   - unified_opportunity_links row with correct source/native_id
 *   - Re-call is idempotent (no duplicate, fields update)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let sourceId: number;

function getDbUrl(): string {
  const envUrl = process.env['DATABASE_URL'];
  if (envUrl) return envUrl;
  const filePath = resolve(import.meta.dirname, '../.db-url');
  return readFileSync(filePath, 'utf-8').trim();
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getDbUrl(), max: 3 });

  // Create a source row (required FK for legacy opportunities)
  const { rows: srcRows } = await pool.query(
    `INSERT INTO sources (kind, title, retrieved_at, confidence)
     VALUES ('internal', 'Unified mirror integration test', NOW(), 'high')
     RETURNING id`,
  );
  sourceId = srcRows[0].id;
});

afterAll(async () => {
  if (pool) {
    // Clean up test data
    await pool.query(
      `DELETE FROM unified_opportunity_links WHERE source_native_id IN ('MIRROR-SAM-001', 'GT-MIRROR-001', 'ARXIV-MIRROR-001')`,
    );
    await pool.query(
      `DELETE FROM opportunities WHERE sam_notice_id = 'MIRROR-SAM-001'`,
    );
    await pool.query(
      `DELETE FROM opportunities WHERE external_id IN ('GT-MIRROR-001', 'ARXIV-MIRROR-001')`,
    );
    await pool.end();
  }
});

describe('mirrorOpportunityToUnified integration', () => {
  it('mirrors a SAM legacy opportunity into unified tables', async () => {
    const { mirrorOpportunityToUnified } = await import(
      '../../../src/services/opportunities/unified-mirror.js'
    );

    // Insert a SAM legacy row
    await pool.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, naics, psc, set_aside,
         value_min, value_max, response_due_at, posted_at,
         sam_notice_id, data_source, status, source_id
       ) VALUES (
         'Mirror Test SAM Opp', 'Dept of Defense', 'DARPA',
         '541512', 'D302', 'SDB', 5000000, 10000000,
         '2026-09-01T00:00:00Z', '2026-03-01T00:00:00Z',
         'MIRROR-SAM-001', 'sam.gov', 'discovery', $1
       ) ON CONFLICT (sam_notice_id) DO NOTHING`,
      [sourceId],
    );

    const { rows: legacyRows } = await pool.query(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities WHERE sam_notice_id = 'MIRROR-SAM-001'`,
    );
    const legacy = legacyRows[0];

    const result = await mirrorOpportunityToUnified(pool, legacy);
    expect(result.created).toBe(true);
    expect(result.internal_id).toBeTruthy();

    // Verify unified_opportunities row
    const { rows: unifiedRows } = await pool.query(
      `SELECT * FROM unified_opportunities WHERE internal_id = $1`,
      [result.internal_id],
    );
    expect(unifiedRows.length).toBe(1);
    const unified = unifiedRows[0];
    expect(unified.lifecycle_stage).toBe('pre_sol');
    expect(unified.primary_source).toBe('sam');
    expect(unified.title).toBe('Mirror Test SAM Opp');
    expect(unified.agency).toBe('Dept of Defense');
    expect(unified.office).toBe('DARPA');
    expect(unified.naics).toBe('541512');
    expect(unified.psc).toBe('D302');
    expect(unified.set_aside).toBe('SDB');
    expect(Number(unified.estimated_value_cents)).toBe(500000000);
    expect(unified.pwin).toBeNull();

    // Verify link
    const { rows: linkRows } = await pool.query(
      `SELECT * FROM unified_opportunity_links WHERE internal_id = $1`,
      [result.internal_id],
    );
    expect(linkRows.length).toBe(1);
    expect(linkRows[0].source).toBe('sam');
    expect(linkRows[0].source_native_id).toBe('MIRROR-SAM-001');
    expect(linkRows[0].match_method).toBe('auto_mirror');
  });

  it('mirrors a GovTribe legacy opportunity', async () => {
    const { mirrorOpportunityToUnified } = await import(
      '../../../src/services/opportunities/unified-mirror.js'
    );

    await pool.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, naics, psc, set_aside,
         value_min, response_due_at, posted_at,
         external_id, govtribe_id, data_source, status, source_id
       ) VALUES (
         'Mirror Test GovTribe Opp', 'Air Force', 'AFLCMC',
         '541519', 'D307', 'WOSB', 3000000,
         '2026-08-20T00:00:00Z', '2026-02-10T00:00:00Z',
         'GT-MIRROR-001', 'GT-MIRROR-001', 'govtribe', 'tracking', $1
       ) ON CONFLICT (data_source, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
      [sourceId],
    );

    const { rows: legacyRows } = await pool.query(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities WHERE govtribe_id = 'GT-MIRROR-001'`,
    );
    const legacy = legacyRows[0];

    const result = await mirrorOpportunityToUnified(pool, legacy);
    expect(result.created).toBe(true);

    // Verify link source is govtribe
    const { rows: linkRows } = await pool.query(
      `SELECT * FROM unified_opportunity_links WHERE internal_id = $1`,
      [result.internal_id],
    );
    expect(linkRows[0].source).toBe('govtribe');
    expect(linkRows[0].source_native_id).toBe('GT-MIRROR-001');
  });

  it('mirrors an arxiv legacy opportunity', async () => {
    const { mirrorOpportunityToUnified } = await import(
      '../../../src/services/opportunities/unified-mirror.js'
    );

    await pool.query(
      `INSERT INTO opportunities (
         title, agency, naics, value_min,
         response_due_at, posted_at,
         external_id, data_source, status, source_id
       ) VALUES (
         'Mirror Test arXiv Paper', 'NSF', '541711', NULL,
         NULL, '2026-01-15T00:00:00Z',
         'ARXIV-MIRROR-001', 'arxiv', 'discovery', $1
       ) ON CONFLICT (data_source, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
      [sourceId],
    );

    const { rows: legacyRows } = await pool.query(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities WHERE external_id = 'ARXIV-MIRROR-001' AND data_source = 'arxiv'`,
    );
    const legacy = legacyRows[0];

    const result = await mirrorOpportunityToUnified(pool, legacy);
    expect(result.created).toBe(true);

    const { rows: linkRows } = await pool.query(
      `SELECT * FROM unified_opportunity_links WHERE internal_id = $1`,
      [result.internal_id],
    );
    expect(linkRows[0].source).toBe('arxiv');
    expect(linkRows[0].source_native_id).toBe('ARXIV-MIRROR-001');
  });

  it('is idempotent: re-call updates but does not create duplicate', async () => {
    const { mirrorOpportunityToUnified } = await import(
      '../../../src/services/opportunities/unified-mirror.js'
    );

    const { rows: legacyRows } = await pool.query(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities WHERE sam_notice_id = 'MIRROR-SAM-001'`,
    );
    const legacy = legacyRows[0];

    // Update the title before re-mirroring
    legacy.title = 'Mirror Test SAM Opp UPDATED';

    const result = await mirrorOpportunityToUnified(pool, legacy);
    expect(result.created).toBe(false);
    expect(result.internal_id).toBeTruthy();

    // Only one link should exist
    const { rows: linkRows } = await pool.query(
      `SELECT * FROM unified_opportunity_links WHERE source = 'sam' AND source_native_id = 'MIRROR-SAM-001'`,
    );
    expect(linkRows.length).toBe(1);

    // Title should be updated
    const { rows: unifiedRows } = await pool.query(
      `SELECT title FROM unified_opportunities WHERE internal_id = $1`,
      [result.internal_id],
    );
    expect(unifiedRows[0].title).toBe('Mirror Test SAM Opp UPDATED');
  });
});
