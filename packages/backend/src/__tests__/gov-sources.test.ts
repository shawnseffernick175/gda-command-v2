/**
 * Regression tests for gov-sources.ts (F-005, F-006)
 *
 * F-005: DIBBS has no API (deprecated). GovTribe old REST API dead but
 *        company is active — deprecation reversed, MCP integration pending.
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

  it("old GovTribe REST fetch handler removed (MCP integration pending)", () => {
    expect(govSources).not.toContain("fetchGovTribeOpportunities");
  });

  it("DIBBS fetch handler removed from sourceHandlers map", () => {
    expect(govSources).not.toContain("dibbs: fetchDIBBSOpportunities");
  });

  it("syncGovSources checks deprecated_at to skip deprecated feeds", () => {
    expect(govSources).toContain("feed.deprecated_at");
    expect(govSources).toContain("gov_source_skipped_deprecated");
  });

  it("migration 049 reverses GovTribe deprecation", () => {
    const m049Path = join(__dirname, "../db/migrations/049_reverse_govtribe_deprecation.sql");
    const m049 = readFileSync(m049Path, "utf8");
    expect(m049).toContain("feed-govtribe");
    expect(m049).toContain("enabled = true");
    expect(m049).toContain("deprecated_at = NULL");
  });

  it("gov-sources.ts documents GovTribe MCP as the current access path", () => {
    expect(govSources).toContain("govtribe.com/mcp");
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
