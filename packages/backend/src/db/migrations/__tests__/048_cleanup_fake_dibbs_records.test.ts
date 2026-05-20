/**
 * Paired test for migration 048: cleanup fake DIBBS records (F-005 follow-up).
 *
 * State dependency: This migration DELETEs rows from opportunities and related
 * FK tables where id LIKE 'dibbs-check-%'. On production databases, these
 * placeholder records were created by the old DIBBS integration code.
 *
 * Contract: After applying 048, all 'dibbs-check-%' rows are removed from
 * opportunities and all FK child tables. Non-DIBBS records are untouched.
 *
 * How to break: Remove the DELETE FROM opportunities line. The child table
 * deletes would succeed (no children for test data without FK inserts), but
 * the parent dibbs-check-% rows would survive in the opportunities table.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 048: cleanup fake DIBBS records", () => {
  it("deletes dibbs-check-% rows from opportunities", async () => {
    pool = await createSeededTestDb("048_cleanup_fake_dibbs_records.sql", {
      tables: [
        {
          table: "opportunities",
          rows: [
            {
              id: "dibbs-check-it-001",
              title: "DLA DIBBS — IT requirements check",
              status: "discovery",
              data_source: "dibbs",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: "dibbs-check-cyber-002",
              title: "DLA DIBBS — cybersecurity requirements check",
              status: "discovery",
              data_source: "dibbs",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: "real-opp-sam-001",
              title: "Real SAM Opportunity",
              status: "pipeline",
              data_source: "sam_gov",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    // Verify pre-state: both DIBBS and real records exist
    const { rows: before } = await pool.query(
      "SELECT id FROM opportunities ORDER BY id",
    );
    expect(before).toHaveLength(3);
    expect(before.map((r: Record<string, unknown>) => r.id)).toContain("dibbs-check-it-001");
    expect(before.map((r: Record<string, unknown>) => r.id)).toContain("real-opp-sam-001");

    // Apply migration
    await applyMigration(pool, "048_cleanup_fake_dibbs_records.sql");

    // Verify post-state: DIBBS records gone, real record preserved
    const { rows: after } = await pool.query(
      "SELECT id FROM opportunities ORDER BY id",
    );
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("real-opp-sam-001");
  });

  it("is a no-op when no dibbs-check-% records exist", async () => {
    if (pool) await destroyTestDb(pool);

    pool = await createSeededTestDb("048_cleanup_fake_dibbs_records.sql", {
      tables: [
        {
          table: "opportunities",
          rows: [
            {
              id: "sam-opp-001",
              title: "SAM Opportunity",
              status: "pipeline",
              data_source: "sam_gov",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    await applyMigration(pool, "048_cleanup_fake_dibbs_records.sql");

    const { rows } = await pool.query("SELECT id FROM opportunities");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("sam-opp-001");
  });
});
