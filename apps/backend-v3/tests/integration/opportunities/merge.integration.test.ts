/**
 * Integration test for the merge service (F-405).
 *
 * Seeds an opportunity with GovWin + SAM + GovTribe linked + one override,
 * then asserts the merged view returns:
 *   - GovWin title (GovWin highest for default fields)
 *   - SAM response_due_at (SAM authoritative for federal due dates)
 *   - GovTribe credit metadata (GovTribe lowest but still contributes)
 *   - Override wins for agency
 *   - pwin + doctrine_status from unified row
 *   - Cache hit on second call
 *   - Cache invalidated on override write
 *
 * Uses the existing testcontainer Postgres pattern (globalSetup → setup.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let internalId: string;

function getDbUrl(): string {
  const envUrl = process.env['DATABASE_URL'];
  if (envUrl) return envUrl;
  const filePath = resolve(import.meta.dirname, '../.db-url');
  return readFileSync(filePath, 'utf-8').trim();
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getDbUrl(), max: 3 });

  // ─── 1. Create a source row (legacy) ───────────────────────────────────
  const { rows: srcRows } = await pool.query(
    `INSERT INTO sources (kind, title, retrieved_at, confidence)
     VALUES ('internal', 'Merge integration test source', NOW(), 'high')
     RETURNING id`,
  );
  const sourceId = srcRows[0].id;

  // ─── 2. Create SAM opportunity in legacy table ─────────────────────────
  await pool.query(
    `INSERT INTO opportunities (
       title, agency, naics, psc, set_aside, value_min, value_max,
       response_due_at, posted_at, description,
       sam_notice_id, data_source, status, source_id
     ) VALUES (
       'SAM — Cloud Migration Services', 'Department of the Air Force',
       '541512', 'D302', 'SDB', 5000000, 10000000,
       '2026-09-15T23:59:00Z', '2026-03-15T00:00:00Z',
       'SAM sourced cloud migration',
       'SAM-MERGE-TEST-001', 'sam_gov', 'tracking', $1
     )
     ON CONFLICT (sam_notice_id) DO NOTHING`,
    [sourceId],
  );

  // ─── 3. Create GovWin opportunity in legacy table ──────────────────────
  await pool.query(
    `INSERT INTO opportunities (
       title, agency, naics, set_aside, value_min, value_max,
       response_due_at, posted_at, description,
       sam_notice_id, data_source, status, source_id
     ) VALUES (
       'GovWin — Air Force Cloud Modernization', 'U.S. Air Force',
       '541511', '8a', 8000000, 15000000,
       '2026-10-01T23:59:00Z', '2026-04-01T00:00:00Z',
       'GovWin intel on AF cloud program',
       'govwin-GW-MERGE-TEST-001', 'govwin', 'tracking', $1
     )
     ON CONFLICT (sam_notice_id) DO NOTHING`,
    [sourceId],
  );

  // ─── 4. Create GovTribe opportunity in legacy table ────────────────────
  await pool.query(
    `INSERT INTO opportunities (
       title, agency, sub_agency, naics, psc, set_aside, value_min,
       response_due_at, posted_at, description,
       external_id, govtribe_id, data_source, status, source_id
     ) VALUES (
       'GovTribe — AF Cloud Services', 'Air Force',
       'AFLCMC', '541519', 'D307', 'WOSB', 3000000,
       '2026-08-20T23:59:00Z', '2026-02-10T00:00:00Z',
       'GovTribe tracked cloud initiative',
       'GT-MERGE-TEST-001', 'GT-MERGE-TEST-001', 'govtribe', 'tracking', $1
     )
     ON CONFLICT (data_source, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
    [sourceId],
  );

  // ─── 5. Create unified opportunity ─────────────────────────────────────
  const { rows: unifiedRows } = await pool.query(
    `INSERT INTO unified_opportunities (
       lifecycle_stage, primary_source, pwin, doctrine_status
     ) VALUES ('solicitation', 'sam', 65, 'qualified')
     RETURNING internal_id`,
  );
  internalId = unifiedRows[0].internal_id;

  // ─── 6. Create links ──────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO unified_opportunity_links (internal_id, source, source_native_id, confidence, match_method, matched_at)
     VALUES
       ($1, 'sam',      'SAM-MERGE-TEST-001',   'HIGH', 'exact_notice_id', NOW()),
       ($1, 'govwin',   'GW-MERGE-TEST-001',    'HIGH', 'sol_num_agency_exact', NOW()),
       ($1, 'govtribe', 'GT-MERGE-TEST-001',    'MEDIUM', 'fuzzy_title_agency', NOW())`,
    [internalId],
  );

  // ─── 7. Add override for agency ────────────────────────────────────────
  await pool.query(
    `INSERT INTO unified_opportunity_field_overrides (internal_id, field_name, field_value_json, set_by, reason)
     VALUES ($1, 'agency', '"Department of the Air Force (corrected)"', $2, 'Manual correction per CO email')`,
    [internalId, 'admin@gda.local'],
  );
});

afterAll(async () => {
  if (pool) {
    // Clean up test data
    if (internalId) {
      await pool.query('DELETE FROM unified_opportunities WHERE internal_id = $1', [internalId]);
    }
    await pool.query("DELETE FROM opportunities WHERE sam_notice_id IN ('SAM-MERGE-TEST-001', 'govwin-GW-MERGE-TEST-001')");
    await pool.query("DELETE FROM opportunities WHERE govtribe_id = 'GT-MERGE-TEST-001'");
    await pool.end();
  }
});

describe('merge integration', () => {
  it('returns the correct merged view with all sources + override', async () => {
    const { getMergedOpportunity, clearMergeCache } = await import(
      '../../../src/services/opportunities/merge.js'
    );
    clearMergeCache();

    const result = await getMergedOpportunity(pool, internalId);

    expect(result).not.toBeNull();
    expect(result!.internal_id).toBe(internalId);

    // Override wins for agency
    expect(result!.agency).toBe('Department of the Air Force (corrected)');
    expect(result!.field_sources['agency']).toBe('override');

    // GovWin title (GovWin highest default precedence)
    expect(result!.title).toBe('GovWin — Air Force Cloud Modernization');
    expect(result!.field_sources['title']).toBe('govwin');

    // SAM response_due_at (SAM authoritative for federal)
    expect(result!.response_due_at).toContain('2026-09-15');
    expect(result!.field_sources['response_due_at']).toBe('sam');

    // estimated_value_cents: GovWin > SAM > GovTribe (GovWin has 8M*100)
    expect(result!.estimated_value_cents).toBe(800000000);
    expect(result!.field_sources['estimated_value_cents']).toBe('govwin');

    // posted_at: earliest across sources (GovTribe was Feb 10)
    expect(result!.posted_at).toContain('2026-02-10');
    expect(result!.field_sources['posted_at']).toBe('govtribe');

    // pwin and doctrine_status from unified row
    expect(result!.pwin).toBe(65);
    expect(result!.doctrine_status).toBe('qualified');

    // GovTribe contributes naics when higher sources don't have it
    // (In this case GovWin has naics too, so GovWin wins)
    expect(result!.naics).toBe('541511');
    expect(result!.field_sources['naics']).toBe('govwin');

    // Links are included
    expect(result!.links.length).toBe(3);
  });

  it('cache hit on second call within 60s', async () => {
    const { getMergedOpportunity, clearMergeCache, mergeCacheSize } = await import(
      '../../../src/services/opportunities/merge.js'
    );
    clearMergeCache();

    const result1 = await getMergedOpportunity(pool, internalId);
    expect(mergeCacheSize()).toBe(1);

    const result2 = await getMergedOpportunity(pool, internalId);
    expect(result1!.internal_id).toBe(result2!.internal_id);
    expect(result1!.title).toBe(result2!.title);
    // Still 1 in cache (same key)
    expect(mergeCacheSize()).toBe(1);
  });

  it('cache invalidated when override written for that internal_id', async () => {
    const { getMergedOpportunity, invalidateMergeCache, clearMergeCache, mergeCacheSize } =
      await import('../../../src/services/opportunities/merge.js');
    clearMergeCache();

    // Populate cache
    await getMergedOpportunity(pool, internalId);
    expect(mergeCacheSize()).toBe(1);

    // Write a new override
    await pool.query(
      `INSERT INTO unified_opportunity_field_overrides (internal_id, field_name, field_value_json, set_by, reason)
       VALUES ($1, 'title', '"Manually Corrected Title"', 'admin@gda.local', 'Test correction')
       ON CONFLICT (internal_id, field_name)
       DO UPDATE SET field_value_json = '"Manually Corrected Title"', set_at = NOW()`,
      [internalId],
    );

    // Invalidate
    invalidateMergeCache(internalId);
    expect(mergeCacheSize()).toBe(0);

    // Re-fetch — should see new override
    const result = await getMergedOpportunity(pool, internalId);
    expect(result!.title).toBe('Manually Corrected Title');
    expect(result!.field_sources['title']).toBe('override');

    // Clean up the test override
    await pool.query(
      `DELETE FROM unified_opportunity_field_overrides
       WHERE internal_id = $1 AND field_name = 'title'`,
      [internalId],
    );
  });
});
