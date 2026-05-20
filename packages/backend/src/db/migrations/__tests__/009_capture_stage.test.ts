/**
 * Paired test for migration 009: capture_stage column + status mapping.
 *
 * State dependency: This migration adds a capture_stage column with DEFAULT
 * 'interest', then UPDATEs existing opportunities based on their current status.
 * The mapping is: discovery→interest, qualified→qualify, pipeline→pursue,
 * won→won, lost→lost.
 *
 * Contract: After applying 009, each opportunity's capture_stage reflects its
 * status. Opportunities already at 'interest' (the default) are mapped correctly.
 *
 * How to break: Remove the WHERE capture_stage = 'interest' guard — on a
 * re-run, previously-overridden capture stages would revert to their status
 * mapping, losing manual overrides.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 009: capture_stage mapping", () => {
  it("maps existing opportunity statuses to correct capture stages", async () => {
    pool = await createSeededTestDb("009_capture_stage.sql", {
      tables: [
        {
          table: "opportunities",
          rows: [
            { id: "opp-discovery", title: "Discovery Opp", status: "discovery" },
            { id: "opp-qualified", title: "Qualified Opp", status: "qualified" },
            { id: "opp-pipeline", title: "Pipeline Opp", status: "pipeline" },
            { id: "opp-won", title: "Won Opp", status: "won" },
            { id: "opp-lost", title: "Lost Opp", status: "lost" },
          ],
        },
      ],
    });

    await applyMigration(pool, "009_capture_stage.sql");

    const { rows } = await pool.query(
      "SELECT id, status, capture_stage FROM opportunities ORDER BY id",
    );

    const byId = Object.fromEntries(rows.map((r) => [r.id, r.capture_stage]));
    expect(byId["opp-discovery"]).toBe("interest");
    expect(byId["opp-qualified"]).toBe("qualify");
    expect(byId["opp-pipeline"]).toBe("pursue");
    expect(byId["opp-won"]).toBe("won");
    expect(byId["opp-lost"]).toBe("lost");
  });
});
