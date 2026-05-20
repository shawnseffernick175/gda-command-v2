/**
 * Paired test for migration 027: remove seeded mock data.
 *
 * State dependency: DELETEs mock/dummy rows from many tables using ID
 * pattern matching (e.g., LIKE 'briefing-%', 'intel-%'). Must only
 * delete rows with mock-style IDs while preserving real user data.
 *
 * Contract: After applying 027, rows with mock-style IDs are gone, but
 * rows with non-mock IDs remain intact.
 *
 * How to break: Change a LIKE pattern to be too broad (e.g., '%' instead
 * of 'briefing-%'), which would delete all rows including real data.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 027: remove mock data", () => {
  it("deletes mock-ID rows while preserving real data", async () => {
    pool = await createSeededTestDb("027_remove_mock_data.sql", {
      tables: [
        {
          table: "intel_items",
          rows: [
            { id: "intel-001", title: "Mock Intel", summary: "mock", category: "market", source: "manual" },
            { id: "real-intel-1", title: "Real Intel", summary: "real", category: "market", source: "manual" },
          ],
        },
        {
          table: "contacts",
          rows: [
            { id: "contact-001", first_name: "Mock", last_name: "Contact" },
            { id: "CON-real-1", first_name: "Real", last_name: "Contact" },
          ],
        },
      ],
    });

    // Verify pre-state: both mock and real rows exist
    const { rows: intelBefore } = await pool.query("SELECT id FROM intel_items ORDER BY id");
    expect(intelBefore).toHaveLength(2);
    const { rows: contactsBefore } = await pool.query("SELECT id FROM contacts ORDER BY id");
    expect(contactsBefore).toHaveLength(2);

    await applyMigration(pool, "027_remove_mock_data.sql");

    // Mock rows gone, real rows preserved
    const { rows: intelAfter } = await pool.query("SELECT id FROM intel_items");
    expect(intelAfter).toHaveLength(1);
    expect(intelAfter[0].id).toBe("real-intel-1");

    const { rows: contactsAfter } = await pool.query("SELECT id FROM contacts");
    expect(contactsAfter).toHaveLength(1);
    expect(contactsAfter[0].id).toBe("CON-real-1");
  });
});
