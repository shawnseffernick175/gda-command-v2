/**
 * Paired test for migration 010: data_source column + URL-based classification.
 *
 * State dependency: This migration adds a data_source column with DEFAULT
 * 'manual', then UPDATEs existing opportunities based on their raw_source_url
 * to classify them as 'sam.gov' or 'fpds'.
 *
 * Contract: After applying 010, opportunities with SAM URLs get data_source
 * 'sam.gov', those with FPDS/USAspending URLs get 'fpds', and everything
 * else stays 'manual'.
 *
 * How to break: Swap the order of the two UPDATE statements — the FPDS
 * update would overwrite SAM URLs that also contain 'usaspending'.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 010: data_source classification", () => {
  it("classifies opportunities by raw_source_url", async () => {
    pool = await createSeededTestDb("010_opp_data_source.sql", {
      tables: [
        {
          table: "opportunities",
          rows: [
            { id: "opp-sam", title: "SAM Opp", raw_source_url: "https://sam.gov/opp/123" },
            { id: "opp-fpds", title: "FPDS Opp", raw_source_url: "https://www.fpds.gov/ezsearch/search.do?q=123" },
            { id: "opp-usa", title: "USAspending Opp", raw_source_url: "https://api.usaspending.gov/v2/awards/123" },
            { id: "opp-manual", title: "Manual Opp", raw_source_url: null },
            { id: "opp-other", title: "Other Opp", raw_source_url: "https://govwin.com/opp/456" },
          ],
        },
      ],
    });

    await applyMigration(pool, "010_opp_data_source.sql");

    const { rows } = await pool.query(
      "SELECT id, data_source FROM opportunities ORDER BY id",
    );

    const byId = Object.fromEntries(rows.map((r) => [r.id, r.data_source]));
    expect(byId["opp-sam"]).toBe("sam.gov");
    expect(byId["opp-fpds"]).toBe("fpds");
    expect(byId["opp-usa"]).toBe("fpds");
    expect(byId["opp-manual"]).toBe("manual");
    expect(byId["opp-other"]).toBe("manual");
  });
});
