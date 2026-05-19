/**
 * Regression tests for gov-sources.ts (F-005, F-006)
 *
 * F-005: DIBBS has no API (deprecated). GovTribe old REST API dead but
 *        company is active — MCP integration rebuilt via govtribe.com/mcp.
 * F-006: GovWin returns HTML — sync must validate content-type before parsing
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const govSourcesPath = join(__dirname, "../lib/gov-sources.ts");
const govSources = readFileSync(govSourcesPath, "utf8");

const migrationPath = join(__dirname, "../db/migrations/047_gov_source_deprecation.sql");
const migration = readFileSync(migrationPath, "utf8");

const m049Path = join(__dirname, "../db/migrations/049_reverse_govtribe_deprecation.sql");
const m049 = readFileSync(m049Path, "utf8");

const qaRoutesPath = join(__dirname, "../routes/qa.ts");
const qaRoutes = readFileSync(qaRoutesPath, "utf8");

describe("F-005: DIBBS deprecated, GovTribe MCP integration", () => {
  it("migration 047 disables and deprecates DIBBS feed", () => {
    expect(migration).toContain("feed-dibbs");
    expect(migration).toContain("no public JSON API");
  });

  it("migration 049 reverses GovTribe deprecation", () => {
    expect(m049).toContain("feed-govtribe");
    expect(m049).toContain("enabled = true");
    expect(m049).toContain("deprecated_at = NULL");
  });

  it("GovTribe MCP client uses govtribe.com/mcp endpoint", () => {
    expect(govSources).toContain("https://govtribe.com/mcp");
    expect(govSources).toContain("GOVTRIBE_API_KEY");
  });

  it("GovTribe MCP calls Search_Federal_Contract_Opportunities", () => {
    expect(govSources).toContain("Search_Federal_Contract_Opportunities");
  });

  it("GovTribe handler uses callGovTribeMCP with JSON-RPC protocol", () => {
    expect(govSources).toContain("jsonrpc:");
    expect(govSources).toContain("tools/call");
    expect(govSources).toContain("Bearer");
  });

  it("GovTribe handler validates MCP response content-type", () => {
    expect(govSources).toContain('validateJsonResponse(resp, "govtribe_mcp")');
  });

  it("GovTribe handler maps MCP response to GovOpportunity format", () => {
    expect(govSources).toContain("mapGovTribeOpp");
    expect(govSources).toContain('source: "govtribe"');
    expect(govSources).toContain("govtribe_id");
  });

  it("GovTribe is registered in sourceHandlers", () => {
    expect(govSources).toContain("govtribe: fetchGovTribeOpportunities");
  });

  it("DIBBS fetch handler removed from sourceHandlers map", () => {
    expect(govSources).not.toContain("dibbs: fetchDIBBSOpportunities");
  });

  it("syncGovSources checks deprecated_at to skip deprecated feeds", () => {
    expect(govSources).toContain("feed.deprecated_at");
    expect(govSources).toContain("gov_source_skipped_deprecated");
  });

  it("GovTribe handler logs missing API key with actionable hint", () => {
    expect(govSources).toContain("govtribe_no_api_key");
  });

  it("GovTribe handler handles MCP error responses", () => {
    expect(govSources).toContain("GovTribe MCP error");
    expect(govSources).toContain("GovTribe MCP tool error");
  });

  it("GovTribe handler deduplicates results across keyword searches", () => {
    expect(govSources).toContain("seenIds");
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
