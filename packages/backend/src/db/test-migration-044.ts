/**
 * Regression test for migration 044 (seed version-zero snapshots).
 *
 * Root cause of the daily crash: migration 044 cast TEXT IDs to UUID
 * unnecessarily. The opportunities table uses TEXT PKs, and some rows
 * have non-UUID IDs like "opp-003". The cast crashed, process.exit(1)
 * fired, Docker restarted the container, and the cycle repeated.
 *
 * This test runs AFTER all migrations and verifies:
 *  1. Inserting a non-UUID ID into opportunities does not crash 044's logic
 *  2. No record_version row is created for the non-UUID ID
 *  3. A valid UUID ID DOES get a record_version row
 *
 * Usage: DATABASE_URL=... npx tsx src/db/test-migration-044.ts
 */

import pg from "pg";

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
    process.stdout.write("[test-044] Starting regression test...\n");

    // Insert a row with a non-UUID text ID
    const nonUuidId = "opp-regression-test-044";
    await pool.query(
      `INSERT INTO opportunities (id, title, status) VALUES ($1, $2, 'discovery')
       ON CONFLICT (id) DO NOTHING`,
      [nonUuidId, "Regression Test Opportunity"]
    );

    // Insert a row with a valid UUID text ID
    const uuidId = "a0000000-0000-0000-0000-000000000044";
    await pool.query(
      `INSERT INTO opportunities (id, title, status) VALUES ($1, $2, 'discovery')
       ON CONFLICT (id) DO NOTHING`,
      [uuidId, "Regression Test UUID Opportunity"]
    );

    // Remove any prior version entries for these IDs
    await pool.query(
      `DELETE FROM record_version WHERE record_id IN ($1, $2)`,
      [nonUuidId, uuidId]
    );

    // Run the same DO $$ logic from migration 044 against opportunities only
    await pool.query(`
      DO $$
      DECLARE
        row_rec RECORD;
        snap JSONB;
        id_val TEXT;
      BEGIN
        FOR row_rec IN SELECT * FROM opportunities
        LOOP
          snap := to_jsonb(row_rec);
          id_val := snap->>'id';
          CONTINUE WHEN id_val IS NULL
            OR id_val !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
          INSERT INTO record_version
            (table_name, record_id, version_number, snapshot, changed_by, change_type)
          VALUES
            ('opportunities', id_val, 0, snap, '00000000-0000-0000-0000-000000000000', 'create')
          ON CONFLICT DO NOTHING;
        END LOOP;
      END $$;
    `);

    // Verify: no record_version row for the non-UUID ID
    const { rows: nonUuidRows } = await pool.query(
      `SELECT * FROM record_version WHERE record_id = $1`,
      [nonUuidId]
    );
    assert(
      nonUuidRows.length === 0,
      `Non-UUID ID "${nonUuidId}" was correctly skipped (0 version rows)`
    );

    // Verify: record_version row exists for the valid UUID ID
    const { rows: uuidRows } = await pool.query(
      `SELECT * FROM record_version WHERE record_id = $1`,
      [uuidId]
    );
    assert(
      uuidRows.length > 0,
      `UUID ID "${uuidId}" has a version-0 row (${uuidRows.length} row(s))`
    );

    // Cleanup
    await pool.query(`DELETE FROM record_version WHERE record_id IN ($1, $2)`, [
      nonUuidId,
      uuidId,
    ]);
    await pool.query(`DELETE FROM opportunities WHERE id IN ($1, $2)`, [
      nonUuidId,
      uuidId,
    ]);

    process.stdout.write(
      `[test-044] Done: ${passed} passed, ${failed} failed\n`
    );
    if (failed > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  process.stderr.write(`[test-044] fatal: ${e.message}\n`);
  process.exit(1);
});
