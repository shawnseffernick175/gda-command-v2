/**
 * Paired test for migration 047: deprecate GovTribe + DIBBS source feeds.
 *
 * State dependency: UPDATEs gov_source_feeds rows for feed-govtribe and
 * feed-dibbs to set enabled=false, deprecated_at=NOW(), and a reason string.
 * Requires these rows to exist from prior seed migrations (016).
 *
 * Contract: After applying 047, both feeds are disabled with deprecation
 * metadata set. Other feeds (e.g., feed-sam) remain unchanged.
 *
 * How to break: Remove the WHERE clause — all feeds would be marked
 * deprecated, disabling SAM and other active sources.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 047: gov source deprecation", () => {
  it("deprecates GovTribe and DIBBS while leaving other feeds active", async () => {
    pool = await createSeededTestDb("047_gov_source_deprecation.sql", {
      tables: [],
    });

    // Verify pre-state: GovTribe and DIBBS are enabled (from seed migrations)
    const { rows: before } = await pool.query(
      "SELECT id, enabled FROM gov_source_feeds WHERE id IN ('feed-govtribe', 'feed-dibbs') ORDER BY id",
    );
    expect(before).toHaveLength(2);
    for (const row of before) {
      expect(row.enabled).toBe(true);
    }

    // SAM should also be enabled
    const { rows: samBefore } = await pool.query(
      "SELECT enabled FROM gov_source_feeds WHERE id = 'feed-sam-gov'",
    );
    expect(samBefore).toHaveLength(1);
    expect(samBefore[0].enabled).toBe(true);

    await applyMigration(pool, "047_gov_source_deprecation.sql");

    // GovTribe: disabled + deprecated
    const { rows: govtribe } = await pool.query(
      "SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-govtribe'",
    );
    expect(govtribe[0].enabled).toBe(false);
    expect(govtribe[0].deprecated_at).not.toBeNull();
    expect(govtribe[0].deprecation_reason).toContain("GovTribe");

    // DIBBS: disabled + deprecated
    const { rows: dibbs } = await pool.query(
      "SELECT enabled, deprecated_at, deprecation_reason FROM gov_source_feeds WHERE id = 'feed-dibbs'",
    );
    expect(dibbs[0].enabled).toBe(false);
    expect(dibbs[0].deprecated_at).not.toBeNull();
    expect(dibbs[0].deprecation_reason).toContain("DIBBS");

    // SAM: still enabled, not deprecated
    const { rows: sam } = await pool.query(
      "SELECT enabled, deprecated_at FROM gov_source_feeds WHERE id = 'feed-sam-gov'",
    );
    expect(sam[0].enabled).toBe(true);
    expect(sam[0].deprecated_at).toBeNull();
  });
});
