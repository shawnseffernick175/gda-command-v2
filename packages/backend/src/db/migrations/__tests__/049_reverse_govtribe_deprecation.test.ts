/**
 * Paired test for migration 049: reverse GovTribe deprecation (F-005).
 *
 * State dependency: Migration 047 marked GovTribe as deprecated (enabled=false,
 * deprecated_at=NOW()). This migration reverses that by setting enabled=true
 * and clearing the deprecation fields — but only for feed-govtribe.
 *
 * Contract: After applying 049, the feed-govtribe row has enabled=true,
 * deprecated_at=NULL, and deprecation_reason=NULL. The feed-dibbs row
 * (also deprecated by 047) remains deprecated.
 *
 * How to break: Change the WHERE clause to match all deprecated feeds instead
 * of just feed-govtribe. This would un-deprecate DIBBS, which should stay
 * deprecated.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 049: reverse GovTribe deprecation", () => {
  it("re-enables GovTribe while leaving DIBBS deprecated", async () => {
    // Prior migrations (016 seeds feeds, 047 deprecates govtribe + dibbs)
    // set up the state we need — no extra seeding required
    pool = await createSeededTestDb("049_reverse_govtribe_deprecation.sql", {
      tables: [],
    });

    // Verify pre-state: GovTribe and DIBBS are both deprecated (set by 047)
    const { rows: govtribeBefore } = await pool.query(
      "SELECT enabled, deprecated_at FROM gov_source_feeds WHERE id = 'feed-govtribe'",
    );
    expect(govtribeBefore).toHaveLength(1);
    expect(govtribeBefore[0].enabled).toBe(false);
    expect(govtribeBefore[0].deprecated_at).not.toBeNull();

    const { rows: dibbsBefore } = await pool.query(
      "SELECT enabled, deprecated_at FROM gov_source_feeds WHERE id = 'feed-dibbs'",
    );
    expect(dibbsBefore).toHaveLength(1);
    expect(dibbsBefore[0].enabled).toBe(false);
    expect(dibbsBefore[0].deprecated_at).not.toBeNull();

    // Apply migration
    await applyMigration(pool, "049_reverse_govtribe_deprecation.sql");

    // Verify post-state: GovTribe re-enabled, DIBBS still deprecated
    const { rows: govtribe } = await pool.query(
      "SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-govtribe'",
    );
    expect(govtribe).toHaveLength(1);
    expect(govtribe[0].enabled).toBe(true);
    expect(govtribe[0].deprecated_at).toBeNull();
    expect(govtribe[0].deprecation_reason).toBeNull();

    const { rows: dibbs } = await pool.query(
      "SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-dibbs'",
    );
    expect(dibbs).toHaveLength(1);
    expect(dibbs[0].enabled).toBe(false);
    expect(dibbs[0].deprecated_at).not.toBeNull();
    expect(dibbs[0].deprecation_reason).toContain("DIBBS");
  });

});
