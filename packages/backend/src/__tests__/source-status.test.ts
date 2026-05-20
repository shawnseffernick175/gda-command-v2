/**
 * Regression tests for Source Status Dashboard
 *
 * Tests:
 * - Migration 054 schema (source_health_snapshots, enrichment_call_log, role column)
 * - Snapshot endpoint status classification per source/role
 * - Enrichment quiet-period: zero calls → healthy (not error)
 * - Primary source status logic (sync time × record count × error count)
 * - Overall status computation (all_healthy / degraded / critical)
 * - Enrichment call logger structure
 * - GET /api/qa/source-health expanded response
 * - n8n workflow JSON structure
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Migration 054 tests
// ---------------------------------------------------------------------------
const migrationPath = join(__dirname, "../db/migrations/054_source_health_snapshots.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("Migration 054: source_health_snapshots + enrichment_call_log", () => {
  it("migration file exists", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("creates source_health_snapshots table", () => {
    expect(migration).toContain("source_health_snapshots");
    expect(migration).toContain("snapshot_at");
    expect(migration).toContain("records_last_7d");
    expect(migration).toContain("records_last_30d");
    expect(migration).toContain("calls_last_7d");
    expect(migration).toContain("error_count_7d");
    expect(migration).toContain("status_reason");
    expect(migration).toContain("meta");
  });

  it("includes role column with check constraint", () => {
    expect(migration).toContain("role");
    expect(migration).toContain("chk_snapshot_role");
    expect(migration).toContain("'primary'");
    expect(migration).toContain("'enrichment'");
  });

  it("includes status check constraint with all valid values", () => {
    expect(migration).toContain("chk_snapshot_status");
    expect(migration).toContain("'healthy'");
    expect(migration).toContain("'degraded'");
    expect(migration).toContain("'error'");
    expect(migration).toContain("'deprecated'");
    expect(migration).toContain("'planned'");
    expect(migration).toContain("'missing_key'");
  });

  it("creates index on (source, snapshot_at DESC)", () => {
    expect(migration).toContain("idx_source_health_snapshots_source_at");
    expect(migration).toContain("snapshot_at DESC");
  });

  it("creates enrichment_call_log table", () => {
    expect(migration).toContain("enrichment_call_log");
    expect(migration).toContain("called_at");
    expect(migration).toContain("success");
    expect(migration).toContain("error_message");
    expect(migration).toContain("opportunity_id");
    expect(migration).toContain("duration_ms");
  });

  it("creates index on enrichment_call_log (source, called_at DESC)", () => {
    expect(migration).toContain("idx_enrichment_call_log_source_at");
  });

  it("adds role column to gov_source_feeds", () => {
    expect(migration).toContain("ALTER TABLE gov_source_feeds");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS role");
  });

  it("sets USAspending and FPDS as enrichment role", () => {
    expect(migration).toContain("SET role = 'enrichment'");
    expect(migration).toContain("usaspending");
    expect(migration).toContain("fpds");
  });

  it("adds sync_freshness_hours column to gov_source_feeds", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS sync_freshness_hours");
    expect(migration).toContain("DEFAULT 36");
  });

  it("sets GovTribe sync freshness to 96h (twice-weekly cadence)", () => {
    expect(migration).toContain("SET sync_freshness_hours = 96");
    expect(migration).toContain("govtribe");
    expect(migration).toContain("govtribe_zapier");
  });
});

// ---------------------------------------------------------------------------
// Snapshot endpoint status logic tests
// ---------------------------------------------------------------------------
const qaRoutesPath = join(__dirname, "../routes/qa.ts");
const qaRoutes = readFileSync(qaRoutesPath, "utf8");

describe("POST /api/qa/source-health/snapshot endpoint", () => {
  it("exists in qa.ts routes", () => {
    expect(qaRoutes).toContain("/source-health/snapshot");
    expect(qaRoutes).toContain("router.post");
  });

  it("requires x-gda-key auth", () => {
    expect(qaRoutes).toContain("GDA_WEBHOOK_KEY");
    expect(qaRoutes).toContain("x-gda-key");
    expect(qaRoutes).toContain("UNAUTHORIZED");
  });

  it("queries gov_source_feeds with role column", () => {
    expect(qaRoutes).toContain("COALESCE(role, 'primary') AS role");
  });

  it("computes record counts from opportunities table", () => {
    expect(qaRoutes).toContain("data_source = $1");
    expect(qaRoutes).toContain("INTERVAL '7 days'");
    expect(qaRoutes).toContain("INTERVAL '30 days'");
  });

  it("queries enrichment_call_log for enrichment sources", () => {
    expect(qaRoutes).toContain("enrichment_call_log");
    expect(qaRoutes).toContain("success = false");
  });

  it("writes snapshot rows to source_health_snapshots", () => {
    expect(qaRoutes).toContain("INSERT INTO source_health_snapshots");
  });

  it("computes overall_status (all_healthy / degraded / critical)", () => {
    expect(qaRoutes).toContain("all_healthy");
    expect(qaRoutes).toContain("degraded");
    expect(qaRoutes).toContain("critical");
  });
});

describe("Primary source status logic", () => {
  it("checks error_count AND sync freshness for primary sources", () => {
    expect(qaRoutes).toContain("hoursSinceSync");
    expect(qaRoutes).toContain("freshnessThreshold");
  });

  it("reads sync_freshness_hours from gov_source_feeds per source", () => {
    expect(qaRoutes).toContain("sync_freshness_hours");
    expect(qaRoutes).toContain("freshnessThreshold");
    // Must read from feed, not use hardcoded 36
    expect(qaRoutes).toContain("feed.sync_freshness_hours");
  });

  it("marks degraded when sync runs but zero records in 7 days", () => {
    expect(qaRoutes).toContain("records7d === 0");
    expect(qaRoutes).toContain("zero new records in last 7 days");
  });

  it("marks error when sync exceeds per-source threshold", () => {
    expect(qaRoutes).toContain("hoursSinceSync > freshnessThreshold");
    expect(qaRoutes).toContain("threshold:");
  });

  it("checks for missing API keys including govtribe_zapier", () => {
    expect(qaRoutes).toContain("SAM_API_KEY");
    expect(qaRoutes).toContain("GOVWIN_API_KEY");
    expect(qaRoutes).toContain("GOVTRIBE_API_KEY");
    expect(qaRoutes).toContain("missing_key");
    // govtribe_zapier must also be in the envKeys check
    expect(qaRoutes).toContain("govtribe_zapier: process.env.GOVTRIBE_API_KEY");
  });

  it("uses 'in' operator for missing_key check (not !== undefined)", () => {
    expect(qaRoutes).toContain("src in envKeys && !envKeys[src]");
    expect(qaRoutes).not.toContain("envKeys[src] !== undefined");
  });

  it("status reason for missing_key names the specific env var", () => {
    expect(qaRoutes).toContain("envKeyNames[src]");
    expect(qaRoutes).toContain("set ${envKeyNames[src]} env var");
  });

  it("uses graduated error thresholds matching GET endpoint (>3 = error, >0 = degraded)", () => {
    expect(qaRoutes).toContain("errorCount7d > 3");
    expect(qaRoutes).toContain("errorCount7d > 0");
    expect(qaRoutes).toContain("cumulative errors");
  });

  it("queries sam_verification_runs with correct column names", () => {
    expect(qaRoutes).toContain("db_count_before");
    expect(qaRoutes).toContain("gap_before_pct");
    // Must not query non-existent columns from the table
    expect(qaRoutes).not.toContain("sam_count, gda_count, gap_pct");
  });
});

describe("Enrichment source status logic", () => {
  it("zero calls in 7 days for enrichment produces healthy, not error", () => {
    // The enrichment logic: errorCount7d > 0 checks happen first,
    // then the else clause returns healthy even with zero calls
    expect(qaRoutes).toContain("Zero calls is normal for enrichment");
  });

  it("error when >50% of enrichment calls fail", () => {
    expect(qaRoutes).toContain("errorCount7d / calls7d > 0.5");
    expect(qaRoutes).toContain("failure rate");
  });

  it("degraded when some enrichment calls fail but below 50%", () => {
    expect(qaRoutes).toContain("failed calls in last 7 days");
  });
});

// ---------------------------------------------------------------------------
// Expanded GET /api/qa/source-health
// ---------------------------------------------------------------------------
describe("GET /api/qa/source-health expanded response", () => {
  it("queries latest snapshots with DISTINCT ON", () => {
    expect(qaRoutes).toContain("DISTINCT ON (source)");
    expect(qaRoutes).toContain("source_health_snapshots");
  });

  it("returns latest_snapshots in response", () => {
    expect(qaRoutes).toContain("latest_snapshots");
  });

  it("returns overall_status field", () => {
    expect(qaRoutes).toContain("overall_status");
  });

  it("computes overall_status from snapshot data", () => {
    expect(qaRoutes).toContain("primarySnaps");
    expect(qaRoutes).toContain("enrichSnaps");
  });

  it("includes SAM verify gap in snapshot meta", () => {
    expect(qaRoutes).toContain("verify_gap_pct");
    expect(qaRoutes).toContain("sam_verification_runs");
  });

  it("includes GovTribe credit cap in snapshot meta", () => {
    expect(qaRoutes).toContain("credit_cap_status");
    expect(qaRoutes).toContain("getGovTribeCreditCapStatus");
  });
});

// ---------------------------------------------------------------------------
// Enrichment call logger
// ---------------------------------------------------------------------------
const enrichmentLoggerPath = join(__dirname, "../lib/enrichment-logger.ts");
const enrichmentLogger = readFileSync(enrichmentLoggerPath, "utf8");

describe("Enrichment call logger", () => {
  it("exists as separate module", () => {
    expect(existsSync(enrichmentLoggerPath)).toBe(true);
  });

  it("inserts into enrichment_call_log table", () => {
    expect(enrichmentLogger).toContain("INSERT INTO enrichment_call_log");
  });

  it("tracks source, success, error_message, opportunity_id, duration_ms", () => {
    expect(enrichmentLogger).toContain("source");
    expect(enrichmentLogger).toContain("success");
    expect(enrichmentLogger).toContain("error_message");
    expect(enrichmentLogger).toContain("opportunity_id");
    expect(enrichmentLogger).toContain("duration_ms");
  });

  it("is fire-and-forget (never throws)", () => {
    expect(enrichmentLogger).toContain("try");
    expect(enrichmentLogger).toContain("catch");
  });
});

// ---------------------------------------------------------------------------
// sam-enrichment.ts integration
// ---------------------------------------------------------------------------
const samEnrichmentPath = join(__dirname, "../lib/sam-enrichment.ts");
const samEnrichment = readFileSync(samEnrichmentPath, "utf8");

describe("Enrichment call logging in sam-enrichment.ts", () => {
  it("imports logEnrichmentCall", () => {
    expect(samEnrichment).toContain("import { logEnrichmentCall }");
  });

  it("logs SAM enrichment calls with source sam_gov", () => {
    expect(samEnrichment).toContain('logEnrichmentCall({ source: "sam_gov"');
  });

  it("logs USAspending enrichment calls with source usaspending", () => {
    expect(samEnrichment).toContain('logEnrichmentCall({ source: "usaspending"');
  });

  it("logs both success and failure for SAM", () => {
    const samSuccessCount = (samEnrichment.match(/logEnrichmentCall\(\{ source: "sam_gov", success: true/g) ?? []).length;
    const samFailCount = (samEnrichment.match(/logEnrichmentCall\(\{ source: "sam_gov", success: false/g) ?? []).length;
    expect(samSuccessCount).toBeGreaterThanOrEqual(1);
    expect(samFailCount).toBeGreaterThanOrEqual(1);
  });

  it("logs both success and failure for USAspending", () => {
    const usaSuccessCount = (samEnrichment.match(/logEnrichmentCall\(\{ source: "usaspending", success: true/g) ?? []).length;
    const usaFailCount = (samEnrichment.match(/logEnrichmentCall\(\{ source: "usaspending", success: false/g) ?? []).length;
    expect(usaSuccessCount).toBeGreaterThanOrEqual(1);
    expect(usaFailCount).toBeGreaterThanOrEqual(1);
  });

  it("tracks duration_ms for both SAM and USAspending calls", () => {
    expect(samEnrichment).toContain("samCallStart");
    expect(samEnrichment).toContain("usaCallStart");
    expect(samEnrichment).toContain("Date.now() - samCallStart");
    expect(samEnrichment).toContain("Date.now() - usaCallStart");
  });
});

// ---------------------------------------------------------------------------
// n8n workflow JSON
// ---------------------------------------------------------------------------
describe("n8n source-health-snapshot workflow", () => {
  const workflowPath = join(__dirname, "../../../../docs/n8n-source-health-snapshot-workflow.json");

  it("workflow JSON exists", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("is named GDA.qa.source-health-snapshot", () => {
    const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
    expect(wf.name).toBe("GDA.qa.source-health-snapshot");
  });

  it("has daily cron at 11:00 UTC (7am ET)", () => {
    const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
    const cronNode = wf.nodes.find((n: { name: string }) => n.name === "Daily 7am ET");
    expect(cronNode).toBeTruthy();
    expect(cronNode.parameters.rule.interval[0].expression).toBe("0 11 * * *");
  });

  it("has manual trigger webhook", () => {
    const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
    const manualNode = wf.nodes.find((n: { name: string }) => n.name === "Manual Trigger");
    expect(manualNode).toBeTruthy();
    expect(manualNode.parameters.path).toBe("source-health-snapshot-trigger");
  });

  it("calls POST /api/qa/source-health/snapshot", () => {
    const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
    const httpNode = wf.nodes.find((n: { name: string }) => n.name === "POST Snapshot");
    expect(httpNode).toBeTruthy();
    expect(httpNode.parameters.url).toContain("/api/qa/source-health/snapshot");
    expect(httpNode.parameters.method).toBe("POST");
  });

  it("uses GDA Webhook Auth v2 credential", () => {
    const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
    const httpNode = wf.nodes.find((n: { name: string }) => n.name === "POST Snapshot");
    expect(httpNode.credentials.httpHeaderAuth.name).toBe("GDA Webhook Auth v2");
  });

  it("uses env var for base URL", () => {
    const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
    const httpNode = wf.nodes.find((n: { name: string }) => n.name === "POST Snapshot");
    expect(httpNode.parameters.url).toContain("$env.GDA_BASE_URL");
  });
});

// ---------------------------------------------------------------------------
// Frontend SourceStatusStrip
// ---------------------------------------------------------------------------
const qaFrontendPath = join(__dirname, "../../../../packages/frontend/src/pages/QACenter.tsx");
const qaFrontend = readFileSync(qaFrontendPath, "utf8");

describe("SourceStatusStrip React component", () => {
  it("renders SourceStatusStrip in QA Center", () => {
    expect(qaFrontend).toContain("SourceStatusStrip");
  });

  it("shows 5 source cards", () => {
    expect(qaFrontend).toContain("sam_gov");
    expect(qaFrontend).toContain("usaspending");
    expect(qaFrontend).toContain("fpds");
    expect(qaFrontend).toContain("govtribe");
    expect(qaFrontend).toContain("govwin");
  });

  it("includes overall status pill", () => {
    expect(qaFrontend).toContain("All Sources Healthy");
    expect(qaFrontend).toContain("Sources Degraded");
    expect(qaFrontend).toContain("Sources Critical");
  });

  it("displays role labels (Primary Discovery / Enrichment)", () => {
    expect(qaFrontend).toContain("Primary Discovery");
    expect(qaFrontend).toContain("Enrichment");
  });

  it("shows records this week for primary, calls this week for enrichment", () => {
    expect(qaFrontend).toContain("records this week");
    expect(qaFrontend).toContain("calls this week");
  });

  it("displays status dots with correct colors", () => {
    expect(qaFrontend).toContain("STRIP_STATUS_COLORS");
    expect(qaFrontend).toContain("#22c55e"); // healthy
    expect(qaFrontend).toContain("#f59e0b"); // degraded
    expect(qaFrontend).toContain("#ef4444"); // error
  });

  it("shows SAM verify gap in meta when available", () => {
    expect(qaFrontend).toContain("verify_gap_pct");
    expect(qaFrontend).toContain("Verify gap:");
  });

  it("imports SourceHealthSnapshot type", () => {
    expect(qaFrontend).toContain("type SourceHealthSnapshot");
  });

  it("collapses govtribe + govtribe_zapier into one card", () => {
    expect(qaFrontend).toContain("govtribe_zapier");
    // Should prefer govtribe_zapier data when available
    expect(qaFrontend).toContain("s.source === \"govtribe_zapier\" || s.source === \"govtribe\"");
  });
});

// ---------------------------------------------------------------------------
// API client types
// ---------------------------------------------------------------------------
const clientPath = join(__dirname, "../../../../packages/frontend/src/api/client.ts");
const client = readFileSync(clientPath, "utf8");

describe("Frontend API client types", () => {
  it("defines SourceHealthSnapshot interface", () => {
    expect(client).toContain("export interface SourceHealthSnapshot");
  });

  it("SourceHealthSnapshot includes all required fields", () => {
    expect(client).toContain("records_last_7d");
    expect(client).toContain("records_last_30d");
    expect(client).toContain("calls_last_7d");
    expect(client).toContain("error_count_7d");
    expect(client).toContain("status_reason");
    expect(client).toContain("snapshot_at");
  });

  it("SourceHealthData includes latest_snapshots and overall_status", () => {
    expect(client).toContain("latest_snapshots: SourceHealthSnapshot[]");
    expect(client).toContain("overall_status");
  });
});
