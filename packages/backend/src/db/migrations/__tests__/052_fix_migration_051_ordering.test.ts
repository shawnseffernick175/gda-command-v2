/**
 * Paired test for migration 052: fix migration 051 ordering.
 *
 * State dependency: Migration 051 had a bug — it added a CHECK constraint
 * before migrating old values, so rows with 'usaspending_fuzzy' or
 * 'usaspending_exact' would violate the constraint. Migration 052 drops
 * the constraint, runs the UPDATEs first, then re-adds the constraint.
 *
 * Contract: After applying 052, all 'usaspending_fuzzy' values become
 * 'usaspending_fuzzy_weak' and all 'usaspending_exact' become
 * 'usaspending_fuzzy_strong'. The CHECK constraint is present and valid.
 *
 * How to break: Skip the UPDATE statements — the CHECK constraint would
 * reject any existing rows with old enum values, causing the migration
 * to fail on databases with real data.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 052: fix incumbent_source constraint ordering", () => {
  it("migrates old enum values before adding constraint", async () => {
    // Seed before migration 050 (which adds the incumbent_source column with
    // the original CHECK constraint allowing 'usaspending_exact'/'usaspending_fuzzy').
    // Then apply 050 and 051, and manually insert old-format values to simulate
    // production state.
    pool = await createSeededTestDb("050_govtribe_zapier_ingest.sql", {
      tables: [
        {
          table: "opportunities",
          rows: [
            { id: "opp-fuzzy", title: "Fuzzy Match", status: "discovery" },
            { id: "opp-exact", title: "Exact Match", status: "pipeline" },
            { id: "opp-sam", title: "SAM Award", status: "won" },
            { id: "opp-none", title: "No Incumbent", status: "discovery" },
          ],
        },
      ],
    });

    // Apply 050 (adds incumbent_source column with original constraint)
    await applyMigration(pool, "050_govtribe_zapier_ingest.sql");

    // Set old-format values that 051's bug wouldn't fix
    await pool.query(
      "UPDATE opportunities SET incumbent_source = 'usaspending_fuzzy' WHERE id = 'opp-fuzzy'",
    );
    await pool.query(
      "UPDATE opportunities SET incumbent_source = 'usaspending_exact' WHERE id = 'opp-exact'",
    );
    await pool.query(
      "UPDATE opportunities SET incumbent_source = 'sam_award' WHERE id = 'opp-sam'",
    );

    // Apply 051 (buggy ordering: constraint first, then update)
    // This may fail on the constraint, but 052 should fix it
    try {
      await applyMigration(pool, "051_fix_incumbent_source_constraint.sql");
    } catch {
      // Expected: 051 may fail if old values exist and constraint is added first
      // Record it as applied anyway (simulating a partial apply scenario)
      await pool.query(
        "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
        ["051_fix_incumbent_source_constraint.sql"],
      );
    }

    // Now apply 052 — this is the migration under test
    await applyMigration(pool, "052_fix_migration_051_ordering.sql");

    const { rows } = await pool.query(
      "SELECT id, incumbent_source FROM opportunities ORDER BY id",
    );

    const byId = Object.fromEntries(rows.map((r) => [r.id, r.incumbent_source]));
    expect(byId["opp-fuzzy"]).toBe("usaspending_fuzzy_weak");
    expect(byId["opp-exact"]).toBe("usaspending_fuzzy_strong");
    expect(byId["opp-sam"]).toBe("sam_award");
    expect(byId["opp-none"]).toBeNull();

    // Verify the CHECK constraint is in place by trying an invalid value
    await expect(
      pool.query("UPDATE opportunities SET incumbent_source = 'invalid' WHERE id = 'opp-fuzzy'"),
    ).rejects.toThrow(/violates check constraint/);
  });
});
