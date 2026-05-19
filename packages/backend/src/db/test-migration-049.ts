/**
 * Regression test for migration 049 (reverse GovTribe deprecation).
 *
 * PR #228 incorrectly deprecated GovTribe alongside DIBBS. GovTribe
 * is an active paid data source — only the old REST API was deprecated,
 * not the company or data product. Migration 049 reverses the deprecation:
 * clears deprecated_at, sets enabled = true for the GovTribe feed.
 *
 * State-dependent: requires migration 047 to have run first (which added
 * the deprecated_at and deprecation_reason columns and set them for GovTribe).
 *
 * Usage: DATABASE_URL=... npx tsx src/db/test-migration-049.ts
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
    process.stdout.write("[test-049] Starting regression test...\n");

    const migration049Path = path.join(
      __dirname,
      "migrations",
      "049_reverse_govtribe_deprecation.sql",
    );
    const migration049SQL = fs.readFileSync(migration049Path, "utf-8");

    // --- Test 1: GovTribe was deprecated by 047, now reversed by 049 ---
    process.stdout.write("\n  Test 1: Reverse GovTribe deprecation\n");

    // Simulate post-047 state: GovTribe is deprecated
    await pool.query(
      `UPDATE gov_source_feeds
       SET enabled = false, deprecated_at = NOW(),
           deprecation_reason = 'GovTribe API was deprecated in 2023 and is no longer accessible'
       WHERE id = 'feed-govtribe'`,
    );

    // Verify GovTribe is deprecated before migration
    const { rows: beforeRows } = await pool.query(
      `SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-govtribe'`,
    );
    assert(
      beforeRows.length === 1 && beforeRows[0].enabled === false && beforeRows[0].deprecated_at !== null,
      `Pre-state: GovTribe is deprecated and disabled`,
    );

    // Run migration 049
    let migrationError: string | null = null;
    try {
      await pool.query(migration049SQL);
    } catch (e) {
      migrationError = (e as Error).message;
    }

    assert(
      migrationError === null,
      migrationError
        ? `Migration 049 failed: ${migrationError}`
        : "Migration 049 completed without error",
    );

    // Verify GovTribe is now enabled and not deprecated
    const { rows: afterRows } = await pool.query(
      `SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-govtribe'`,
    );
    assert(
      afterRows.length === 1 && afterRows[0].enabled === true,
      `GovTribe is enabled after migration`,
    );
    assert(
      afterRows[0].deprecated_at === null,
      `GovTribe deprecated_at cleared`,
    );
    assert(
      afterRows[0].deprecation_reason === null,
      `GovTribe deprecation_reason cleared`,
    );

    // --- Test 2: DIBBS remains deprecated ---
    process.stdout.write("\n  Test 2: DIBBS still deprecated\n");

    const { rows: dibbsRows } = await pool.query(
      `SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-dibbs'`,
    );
    assert(
      dibbsRows.length === 1 && dibbsRows[0].enabled === false && dibbsRows[0].deprecated_at !== null,
      `DIBBS remains deprecated and disabled`,
    );

    // --- Test 3: Fresh deploy (no GovTribe feed row) ---
    process.stdout.write("\n  Test 3: Safe on fresh deploy\n");

    // Delete the GovTribe row to simulate a fresh DB with no feed entry
    await pool.query(`DELETE FROM gov_source_feeds WHERE id = 'feed-govtribe'`);

    // Migration should be a no-op if there's no matching row
    let freshError: string | null = null;
    try {
      await pool.query(migration049SQL);
    } catch (e) {
      freshError = (e as Error).message;
    }

    assert(
      freshError === null,
      freshError
        ? `Migration 049 failed on fresh deploy: ${freshError}`
        : "Migration 049 is safe on fresh deploy (UPDATE is a no-op)",
    );

    // --- Summary ---
    process.stdout.write(`\n[test-049] ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  process.stderr.write(`[test-049] fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
