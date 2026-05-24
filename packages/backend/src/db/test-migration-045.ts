/**
 * Regression test for migration 045 (rename duplicate migration entries).
 *
 * Root cause of the bug in PR #224: migration 045 originally used UPDATE to
 * rename old entries, but the migration runner re-applies the renamed *b_*
 * files before 045 runs (they sort alphabetically earlier). This creates
 * BOTH old-name and new-name entries in schema_migrations, so the UPDATE
 * violates the UNIQUE constraint on the name column.
 *
 * The fix (PR #225) changed UPDATEs to DELETEs. This test verifies the fix
 * by simulating the production state: schema_migrations contains both old
 * and new entries, then 045's SQL runs, and only the new entries remain.
 *
 * This is the test that would have caught the original bug — unlike the
 * migration smoke test (which runs from scratch against an empty DB), this
 * test simulates the state a production database has when 045 executes.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/test-migration-045.ts
 */

import pg from "pg";
import fs from "fs";
import path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://gda:gda_dev_password@localhost:5432/gda";

const OLD_NAMES = [
  "036_vehicle_classification.sql",
  "038_merger_context.sql",
  "039_pgvector_safe.sql",
  "040_seed_anomaly_rules.sql",
];

const NEW_NAMES = [
  "036b_vehicle_classification.sql",
  "038b_merger_context.sql",
  "039b_pgvector_safe.sql",
  "040b_seed_anomaly_rules.sql",
];

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
    process.stdout.write("[test-045] Starting regression test...\n");

    // Read migration 045 SQL
    const migration045Path = path.join(
      __dirname,
      "migrations",
      "045_rename_duplicate_migrations.sql",
    );
    const migration045SQL = fs.readFileSync(migration045Path, "utf-8");

    // --- Test 1: Production case (both old and new entries exist) ---
    // This is the state that caused the UNIQUE violation in PR #224.
    // The migration runner re-applies the renamed *b_* files (they're
    // idempotent), recording them under new names. The old entries from
    // the prior deploy still exist. Migration 045 must handle this.

    process.stdout.write("\n  Test 1: Production state (old + new entries)\n");

    // Insert old-name entries (simulating prior production state)
    for (const name of OLD_NAMES) {
      await pool.query(
        `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }

    // Insert new-name entries (simulating runner re-applying renamed files)
    for (const name of NEW_NAMES) {
      await pool.query(
        `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }

    // Verify both sets exist before running 045
    const { rows: beforeRows } = await pool.query(
      `SELECT name FROM schema_migrations WHERE name = ANY($1) ORDER BY name`,
      [[...OLD_NAMES, ...NEW_NAMES]],
    );
    assert(
      beforeRows.length >= OLD_NAMES.length + NEW_NAMES.length,
      `Pre-state: both old and new entries exist (${beforeRows.length} rows)`,
    );

    // Run migration 045 SQL — this must NOT throw a UNIQUE violation
    let migration045Error: string | null = null;
    try {
      await pool.query(migration045SQL);
    } catch (e) {
      migration045Error = (e as Error).message;
    }

    assert(
      migration045Error === null,
      migration045Error
        ? `Migration 045 failed: ${migration045Error}`
        : "Migration 045 completed without error",
    );

    // After 045: old-name entries should be gone
    const { rows: oldAfter } = await pool.query(
      `SELECT name FROM schema_migrations WHERE name = ANY($1)`,
      [OLD_NAMES],
    );
    assert(
      oldAfter.length === 0,
      `Old-name entries removed (${oldAfter.length} remaining, expected 0)`,
    );

    // After 045: new-name entries should still exist
    const { rows: newAfter } = await pool.query(
      `SELECT name FROM schema_migrations WHERE name = ANY($1)`,
      [NEW_NAMES],
    );
    assert(
      newAfter.length === NEW_NAMES.length,
      `New-name entries preserved (${newAfter.length} of ${NEW_NAMES.length})`,
    );

    // --- Test 2: Fresh deploy case (only new entries, no old ones) ---
    // On a fresh database, the runner applies 036b_* directly and never
    // records 036_*. Migration 045's DELETEs should be harmless no-ops.

    process.stdout.write("\n  Test 2: Fresh deploy (new entries only)\n");

    // Clean up old-name entries (should already be gone from Test 1)
    await pool.query(
      `DELETE FROM schema_migrations WHERE name = ANY($1)`,
      [OLD_NAMES],
    );

    // Run 045 again — should succeed (DELETEs are no-ops)
    let freshError: string | null = null;
    try {
      await pool.query(migration045SQL);
    } catch (e) {
      freshError = (e as Error).message;
    }

    assert(
      freshError === null,
      freshError
        ? `Fresh deploy failed: ${freshError}`
        : "Migration 045 is safe on fresh deploy (DELETEs are no-ops)",
    );

    // New entries still intact
    const { rows: newStillThere } = await pool.query(
      `SELECT name FROM schema_migrations WHERE name = ANY($1)`,
      [NEW_NAMES],
    );
    assert(
      newStillThere.length === NEW_NAMES.length,
      `New entries still intact after fresh-deploy run (${newStillThere.length} of ${NEW_NAMES.length})`,
    );

    // --- Test 3: Verify the original UPDATE-based SQL would have failed ---
    // Re-insert old entries to simulate pre-fix state, then run the
    // UPDATE variant and confirm it throws a UNIQUE violation.

    process.stdout.write(
      "\n  Test 3: Original UPDATE SQL would have failed\n",
    );

    for (const name of OLD_NAMES) {
      await pool.query(
        `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }

    const updateSQL = OLD_NAMES.map(
      (old, i) =>
        `UPDATE schema_migrations SET name = '${NEW_NAMES[i]}' WHERE name = '${old}';`,
    ).join("\n");

    let updateError: string | null = null;
    try {
      await pool.query(updateSQL);
    } catch (e) {
      updateError = (e as Error).message;
    }

    assert(
      updateError !== null && /unique|duplicate/i.test(updateError),
      updateError
        ? `Original UPDATE correctly fails: ${updateError.slice(0, 80)}`
        : "UNEXPECTED: UPDATE did not fail — test setup may be wrong",
    );

    // Cleanup: remove old-name entries left by failed UPDATE
    await pool.query(
      `DELETE FROM schema_migrations WHERE name = ANY($1)`,
      [OLD_NAMES],
    );

    process.stdout.write(
      `\n[test-045] Done: ${passed} passed, ${failed} failed\n`,
    );
    if (failed > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  process.stderr.write(`[test-045] fatal: ${e.message}\n`);
  process.exit(1);
});
