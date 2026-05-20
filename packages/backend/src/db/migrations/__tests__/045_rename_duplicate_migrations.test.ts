/**
 * Paired test for migration 045: rename duplicate migrations (F-010).
 *
 * State dependency: This migration DELETEs stale schema_migrations rows
 * for the four renamed migration files (036, 038, 039, 040). On production
 * databases, these old-name entries exist because the migration runner
 * originally applied them under the non-suffixed names.
 *
 * Contract: After applying 045, the old-name entries are removed and only
 * the new 'b' suffixed entries remain.
 *
 * How to break: Remove one of the DELETE statements from the migration.
 * The corresponding old-name row would survive, leaving the stale entry
 * in schema_migrations.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 045: rename duplicate migrations", () => {
  it("removes stale old-name entries from schema_migrations", async () => {
    const staleNames = [
      "036_vehicle_classification.sql",
      "038_merger_context.sql",
      "039_pgvector_safe.sql",
      "040_seed_anomaly_rules.sql",
    ];

    pool = await createSeededTestDb("045_rename_duplicate_migrations.sql", {
      tables: [
        {
          table: "schema_migrations",
          rows: staleNames.map((name) => ({ name })),
        },
      ],
    });

    // Verify pre-state: stale entries exist
    const { rows: before } = await pool.query(
      "SELECT name FROM schema_migrations WHERE name = ANY($1)",
      [staleNames],
    );
    expect(before).toHaveLength(4);

    // Apply migration
    await applyMigration(pool, "045_rename_duplicate_migrations.sql");

    // Verify post-state: stale entries removed
    const { rows: after } = await pool.query(
      "SELECT name FROM schema_migrations WHERE name = ANY($1)",
      [staleNames],
    );
    expect(after).toHaveLength(0);

    // Verify the migration itself was recorded
    const { rows: recorded } = await pool.query(
      "SELECT name FROM schema_migrations WHERE name = '045_rename_duplicate_migrations.sql'",
    );
    expect(recorded).toHaveLength(1);
  });

  it("is a no-op on fresh databases (no stale entries to delete)", async () => {
    // Cleanup previous pool
    if (pool) await destroyTestDb(pool);

    pool = await createSeededTestDb("045_rename_duplicate_migrations.sql", {
      tables: [], // no extra seeding — fresh schema
    });

    const { rows: before } = await pool.query(
      "SELECT count(*)::int AS cnt FROM schema_migrations",
    );
    const countBefore = before[0].cnt;

    await applyMigration(pool, "045_rename_duplicate_migrations.sql");

    // Only the migration's own record was added
    const { rows: after } = await pool.query(
      "SELECT count(*)::int AS cnt FROM schema_migrations",
    );
    expect(after[0].cnt).toBe(countBefore + 1);
  });
});
