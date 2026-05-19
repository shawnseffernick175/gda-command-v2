/**
 * Regression test for migration 048 (cleanup fake DIBBS records).
 *
 * F-005 follow-up: the DIBBS integration had no real API — it created
 * placeholder records with IDs matching 'dibbs-check-{keyword}-{timestamp}'
 * and titles like "DLA DIBBS — {keyword} requirements check". These are
 * not real opportunities and must be removed.
 *
 * State-dependent: this migration only has an effect on production databases
 * that ran the old DIBBS code. On fresh databases, the DELETEs are no-ops.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/test-migration-048.ts
 */

import pg from "pg";
import fs from "fs";
import path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://gda:gda_dev_password@localhost:5432/gda_command";

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      process.stdout.write(`  PASS: ${msg}\n`);
      passed++;
    } else {
      process.stderr.write(`  FAIL: ${msg}\n`);
      failed++;
    }
  }

  try {
    process.stdout.write("[test-048] Starting regression test...\n");

    // Read migration 048 SQL
    const migration048Path = path.join(
      __dirname,
      "migrations",
      "048_cleanup_fake_dibbs_records.sql",
    );
    const migration048SQL = fs.readFileSync(migration048Path, "utf-8");

    // --- Test 1: Production state (fake DIBBS records exist) ---
    process.stdout.write("\n  Test 1: Production state (fake DIBBS records exist)\n");

    // Insert fake DIBBS records that match production pattern
    const fakeRecords = [
      { id: "dibbs-check-cybersecurity-1700000000000", title: "DLA DIBBS — cybersecurity requirements check", keyword: "cybersecurity" },
      { id: "dibbs-check-logistics-1700000001000", title: "DLA DIBBS — logistics requirements check", keyword: "logistics" },
      { id: "dibbs-check-it-services-1700000002000", title: "DLA DIBBS — it-services requirements check", keyword: "it-services" },
    ];

    for (const rec of fakeRecords) {
      await pool.query(
        `INSERT INTO opportunities (id, title, description, agency, data_source, status, score)
         VALUES ($1, $2, $3, $4, $5, 'discovery', 0)
         ON CONFLICT (id) DO NOTHING`,
        [rec.id, rec.title, `Automated check for ${rec.keyword} requirements on DIBBS`, "Defense Logistics Agency", "dibbs"],
      );
    }

    // Verify fake records exist before migration
    const { rows: beforeRows } = await pool.query(
      `SELECT id FROM opportunities WHERE id LIKE 'dibbs-check-%'`,
    );
    assert(
      beforeRows.length >= fakeRecords.length,
      `Pre-state: ${beforeRows.length} fake DIBBS records exist`,
    );

    // Run migration 048
    let migrationError: string | null = null;
    try {
      await pool.query(migration048SQL);
    } catch (e) {
      migrationError = (e as Error).message;
    }

    assert(
      migrationError === null,
      migrationError
        ? `Migration 048 failed: ${migrationError}`
        : "Migration 048 completed without error",
    );

    // Verify fake records are gone
    const { rows: afterRows } = await pool.query(
      `SELECT id FROM opportunities WHERE id LIKE 'dibbs-check-%'`,
    );
    assert(
      afterRows.length === 0,
      `Fake DIBBS records removed (${afterRows.length} remaining, expected 0)`,
    );

    // --- Test 2: Fresh deploy (no fake records exist) ---
    process.stdout.write("\n  Test 2: Fresh deploy (no fake records)\n");

    // Migration should be a no-op on fresh databases
    let freshError: string | null = null;
    try {
      await pool.query(migration048SQL);
    } catch (e) {
      freshError = (e as Error).message;
    }

    assert(
      freshError === null,
      freshError
        ? `Migration 048 failed on fresh deploy: ${freshError}`
        : "Migration 048 is safe on fresh deploy (DELETEs are no-ops)",
    );

    // --- Test 3: Real opportunities are not affected ---
    process.stdout.write("\n  Test 3: Real opportunities preserved\n");

    // Insert a real opportunity to verify it's not deleted
    const realId = `opp-test-real-${Date.now()}`;
    await pool.query(
      `INSERT INTO opportunities (id, title, status, score)
       VALUES ($1, 'Real Opportunity', 'discovery', 0)
       ON CONFLICT (id) DO NOTHING`,
      [realId],
    );

    // Run migration again
    await pool.query(migration048SQL);

    // Real opportunity should still exist
    const { rows: realRows } = await pool.query(
      `SELECT id FROM opportunities WHERE id = $1`,
      [realId],
    );
    assert(
      realRows.length === 1,
      `Real opportunity preserved after migration (found ${realRows.length})`,
    );

    // Cleanup test data
    await pool.query(`DELETE FROM opportunities WHERE id = $1`, [realId]);

    // --- Summary ---
    process.stdout.write(`\n[test-048] ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    process.stderr.write(`[test-048] FATAL: ${(e as Error).message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
