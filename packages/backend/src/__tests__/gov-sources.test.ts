/**
 * Regression tests for gov-sources.ts (F-005, F-006)
 *
 * F-005: GovTribe API was deprecated in 2023 — sync must skip deprecated feeds
 * F-006: GovWin returns HTML — sync must validate content-type before parsing
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const govSourcesPath = join(__dirname, "../lib/gov-sources.ts");
const govSources = readFileSync(govSourcesPath, "utf8");

const migrationPath = join(__dirname, "../db/migrations/047_gov_source_deprecation.sql");
const migration = readFileSync(migrationPath, "utf8");

const qaRoutesPath = join(__dirname, "../routes/qa.ts");
const qaRoutes = readFileSync(qaRoutesPath, "utf8");

describe("F-005: GovTribe/DIBBS deprecated sources", () => {
  it("migration 047 disables and deprecates GovTribe feed", () => {
    expect(migration).toContain("feed-govtribe");
    expect(migration).toContain("enabled = false");
    expect(migration).toContain("deprecated_at = NOW()");
    expect(migration).toContain("GovTribe API was deprecated in 2023");
  });

  it("migration 047 disables and deprecates DIBBS feed", () => {
    expect(migration).toContain("feed-dibbs");
    expect(migration).toContain("no public JSON API");
  });

  it("GovTribe fetch handler removed from sourceHandlers map", () => {
    expect(govSources).not.toContain("govtribe: fetchGovTribeOpportunities");
  });

  it("DIBBS fetch handler removed from sourceHandlers map", () => {
    expect(govSources).not.toContain("dibbs: fetchDIBBSOpportunities");
  });

  it("syncGovSources checks deprecated_at to skip deprecated feeds", () => {
    expect(govSources).toContain("feed.deprecated_at");
    expect(govSources).toContain("gov_source_skipped_deprecated");
  });
});

describe("F-006: content-type validation for gov source APIs", () => {
  it("validateJsonResponse helper exists", () => {
    expect(govSources).toContain("validateJsonResponse");
  });

  it("validates response is application/json", () => {
    expect(govSources).toContain('contentType.includes("application/json")');
  });

  it("detects HTML responses (login/error pages)", () => {
    expect(govSources).toContain('contentType.includes("text/html")');
  });

  it("GovWin fetch calls validateJsonResponse before parsing", () => {
    const govwinBlock = govSources.slice(
      govSources.indexOf("fetchGovWinOpportunities"),
      govSources.indexOf("syncGovSources"),
    );
    expect(govwinBlock).toContain("validateJsonResponse(resp");
  });
});

describe("QA Center source-health visibility", () => {
  it("source-health endpoint exists in QA routes", () => {
    expect(qaRoutes).toContain('"/source-health"');
  });

  it("endpoint returns deprecation info", () => {
    expect(qaRoutes).toContain("deprecated_at");
    expect(qaRoutes).toContain("deprecation_reason");
  });

  it("endpoint reports API key configuration status", () => {
    expect(qaRoutes).toContain("api_key_configured");
  });
});
