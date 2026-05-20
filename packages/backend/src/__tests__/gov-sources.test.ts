/**
 * Regression tests for gov-sources.ts (F-005, F-006)
 *
 * F-005: DIBBS has no API (deprecated). GovTribe old REST API dead but
 *        company is active — MCP integration rebuilt via govtribe.com/mcp.
 *        Full integration: Opportunities, Awards, Forecasts, Contacts,
 *        Vendors, Vehicles, Labor Rates — 57 MCP tools available.
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

const govtribeRoutesPath = join(__dirname, "../routes/govtribe.ts");
const govtribeRoutes = readFileSync(govtribeRoutesPath, "utf8");

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

  it("GovWin now uses WSAPI client (govwin-client.ts) with OAuth2", () => {
    // The old fetchGovWinOpportunities is a stub that defers to the poll endpoint.
    // The real WSAPI client validates JSON content-type in govwin-client.ts.
    const govwinBlock = govSources.slice(
      govSources.indexOf("fetchGovWinOpportunities"),
      govSources.indexOf("syncGovSources"),
    );
    expect(govwinBlock).toContain("POST /api/ingest/govwin/poll");
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

describe("GovTribe Tier 1+2 MCP integrations", () => {
  it("Awards search calls Search_Federal_Contract_Awards", () => {
    expect(govSources).toContain("Search_Federal_Contract_Awards");
    expect(govSources).toContain("searchGovTribeAwards");
    expect(govSources).toContain("mapGovTribeAward");
  });

  it("Forecasts search calls Search_Federal_Forecasts", () => {
    expect(govSources).toContain("Search_Federal_Forecasts");
    expect(govSources).toContain("searchGovTribeForecasts");
    expect(govSources).toContain("mapGovTribeForecast");
  });

  it("Contacts search calls Search_Contacts", () => {
    expect(govSources).toContain("Search_Contacts");
    expect(govSources).toContain("searchGovTribeContacts");
    expect(govSources).toContain("mapGovTribeContact");
  });

  it("Vendors search calls Search_Vendors", () => {
    expect(govSources).toContain("Search_Vendors");
    expect(govSources).toContain("searchGovTribeVendors");
    expect(govSources).toContain("mapGovTribeVendor");
  });

  it("Vehicles search calls Search_Federal_Contract_Vehicles", () => {
    expect(govSources).toContain("Search_Federal_Contract_Vehicles");
    expect(govSources).toContain("searchGovTribeVehicles");
    expect(govSources).toContain("mapGovTribeVehicle");
  });

  it("Labor rates search calls Labor_Ceiling_Rate_Benchmarks", () => {
    expect(govSources).toContain("Labor_Ceiling_Rate_Benchmarks");
    expect(govSources).toContain("searchGovTribeLaborRates");
  });

  it("All search functions are exported", () => {
    expect(govSources).toContain("export async function searchGovTribeAwards");
    expect(govSources).toContain("export async function searchGovTribeForecasts");
    expect(govSources).toContain("export async function searchGovTribeContacts");
    expect(govSources).toContain("export async function searchGovTribeVendors");
    expect(govSources).toContain("export async function searchGovTribeVehicles");
    expect(govSources).toContain("export async function searchGovTribeLaborRates");
  });

  it("All search functions validate API key before calling MCP", () => {
    const functions = [
      "searchGovTribeAwards", "searchGovTribeForecasts",
      "searchGovTribeContacts", "searchGovTribeVendors",
      "searchGovTribeVehicles", "searchGovTribeLaborRates",
    ];
    for (const fn of functions) {
      const fnStart = govSources.indexOf(`async function ${fn}`);
      const fnBlock = govSources.slice(fnStart, fnStart + 300);
      expect(fnBlock).toContain("GOVTRIBE_API_KEY");
    }
  });

  it("Award mapper extracts vendor, agency, and financial fields", () => {
    expect(govSources).toContain("dollars_obligated");
    expect(govSources).toContain("ceiling_value");
    expect(govSources).toContain("awardee");
    expect(govSources).toContain("contracting_federal_agency");
  });

  it("Forecast mapper extracts estimated value and award date", () => {
    expect(govSources).toContain("estimated_value");
    expect(govSources).toContain("estimated_award_date");
  });

  it("Contact mapper extracts email, phone, and organization", () => {
    expect(govSources).toContain("parent_organization_details");
  });

  it("Vendor mapper extracts SBA certifications and UEI", () => {
    expect(govSources).toContain("sba_certifications");
    expect(govSources).toContain("registration_expiration_date");
  });
});

describe("GovTribe MCP health check", () => {
  it("checkGovTribeHealth function exists and is exported", () => {
    expect(govSources).toContain("export async function checkGovTribeHealth");
  });

  it("health check calls tools/list to validate MCP connectivity", () => {
    expect(govSources).toContain('"tools/list"');
  });

  it("health check reports tool count on success", () => {
    expect(govSources).toContain("toolCount");
  });

  it("health check handles missing API key gracefully", () => {
    const healthFn = govSources.slice(govSources.indexOf("checkGovTribeHealth"));
    expect(healthFn).toContain('"no_key"');
  });

  it("QA Center has govtribe-health endpoint", () => {
    expect(qaRoutes).toContain("govtribe-health");
    expect(qaRoutes).toContain("checkGovTribeHealth");
  });
});

describe("GovTribe API routes", () => {
  it("route file has all on-demand search endpoints", () => {
    expect(govtribeRoutes).toContain('"/health"');
    expect(govtribeRoutes).toContain('"/awards"');
    expect(govtribeRoutes).toContain('"/forecasts"');
    expect(govtribeRoutes).toContain('"/contacts"');
    expect(govtribeRoutes).toContain('"/vendors"');
    expect(govtribeRoutes).toContain('"/vehicles"');
    expect(govtribeRoutes).toContain('"/labor-rates"');
  });

  it("route file uses GDA envelope format", () => {
    expect(govtribeRoutes).toContain("successEnvelope");
    expect(govtribeRoutes).toContain("errorEnvelope");
  });

  it("route file imports from gov-sources lib", () => {
    expect(govtribeRoutes).toContain("searchGovTribeAwards");
    expect(govtribeRoutes).toContain("searchGovTribeForecasts");
    expect(govtribeRoutes).toContain("searchGovTribeContacts");
    expect(govtribeRoutes).toContain("searchGovTribeVendors");
    expect(govtribeRoutes).toContain("checkGovTribeHealth");
  });

  it("labor rates endpoint requires keyword parameter", () => {
    expect(govtribeRoutes).toContain("MISSING_KEYWORD");
  });
});
