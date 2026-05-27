/**
 * F-039 / F-042: Health Sentinel tests.
 *
 * Tests the rollup logic, probe handling, reason formatting, snapshot shape,
 * source_health aggregation, and writers_24h exclusion logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeSourceHealthStatus,
  computeWriters24hStatus,
  computeSecretExpiryStatus,
  computePerSourceStatus,
  parseInventoryExpiries,
  WRITERS_24H_EXCLUDED_NAMES,
} from "../lib/health-sentinel";
import type { SecretExpiryEntry } from "../lib/health-sentinel";

// ---------------------------------------------------------------------------
// Types mirrored from health-sentinel.ts for isolated testing
// ---------------------------------------------------------------------------

type ComponentStatus = "healthy" | "degraded" | "down";
type OverallStatus = "healthy" | "degraded" | "down" | "unknown";

interface ProbeResult {
  name: string;
  status: ComponentStatus;
  latency_ms: number;
  detail: string;
}

interface Snapshot {
  id?: number;
  taken_at: string;
  overall_status: OverallStatus;
  components: ProbeResult[];
  failing_count: number;
  reason: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Rollup logic extracted from health-sentinel.ts for unit testing
// ---------------------------------------------------------------------------

function rollup(components: ProbeResult[]): { overall: OverallStatus; reason: string; failCount: number } {
  const downComponents = components.filter((c) => c.status === "down");
  const degradedComponents = components.filter((c) => c.status === "degraded");
  const failCount = downComponents.length + degradedComponents.length;

  let overall: OverallStatus;
  let reason: string;

  if (downComponents.length > 0) {
    overall = "down";
    const names = downComponents.map((c) => c.name).join(", ");
    reason = `down — ${names} (${downComponents[0].detail})`;
  } else if (degradedComponents.length > 0) {
    overall = "degraded";
    const names = degradedComponents.map((c) => c.name).join(", ");
    reason = `degraded — ${names} (${degradedComponents[0].detail})`;
  } else {
    overall = "healthy";
    reason = `healthy — all ${components.length} components green`;
  }

  if (reason.length > 200) {
    reason = reason.slice(0, 197) + "...";
  }

  return { overall, reason, failCount };
}

/**
 * Simulate a sentinel run with given probe results.
 * Mirrors runSentinel() logic but with mock probes and no DB writes.
 */
function simulateSentinel(
  probeResults: ProbeResult[],
  priorSnapshot?: { taken_at: Date; overall_status: string } | null,
): Snapshot {
  const components = [...probeResults];

  // Stale-self detection
  if (priorSnapshot) {
    const ageMinutes = (Date.now() - priorSnapshot.taken_at.getTime()) / 60000;
    if (ageMinutes > 15 && priorSnapshot.overall_status === "healthy") {
      components.push({
        name: "sentinel_freshness",
        status: "degraded",
        latency_ms: 0,
        detail: `prior snapshot ${Math.round(ageMinutes)}m ago, expected ≤5m`,
      });
    }
  }

  const { overall, reason, failCount } = rollup(components);

  return {
    taken_at: new Date().toISOString(),
    overall_status: overall,
    components,
    failing_count: failCount,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProbe(name: string, status: ComponentStatus, detail = "ok"): ProbeResult {
  return { name, status, latency_ms: 10, detail };
}

const ALL_PROBE_NAMES = [
  "postgres", "n8n_canary", "amendment_monitor", "writers_24h",
  "sam_api", "embeddings", "disk", "source_health", "secret_expiry",
];

function allHealthy(): ProbeResult[] {
  return ALL_PROBE_NAMES.map((n) => makeProbe(n, "healthy"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Health Sentinel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("all probes pass → healthy", () => {
    const snapshot = simulateSentinel(allHealthy());
    expect(snapshot.overall_status).toBe("healthy");
    expect(snapshot.failing_count).toBe(0);
    expect(snapshot.reason).toContain("all 9 components green");
    expect(snapshot.components).toHaveLength(9);
  });

  it("one down → down regardless of others", () => {
    const probes = allHealthy();
    probes[1] = makeProbe("n8n_canary", "down", "last status=error");
    const snapshot = simulateSentinel(probes);
    expect(snapshot.overall_status).toBe("down");
    expect(snapshot.failing_count).toBe(1);
    expect(snapshot.reason).toContain("n8n_canary");
  });

  it("mix of degraded + healthy → degraded", () => {
    const probes = allHealthy();
    probes[4] = makeProbe("sam_api", "degraded", "HTTP 429");
    probes[6] = makeProbe("disk", "degraded", "87% used");
    const snapshot = simulateSentinel(probes);
    expect(snapshot.overall_status).toBe("degraded");
    expect(snapshot.failing_count).toBe(2);
    expect(snapshot.reason).toContain("sam_api");
  });

  it("probe timeout treated as degraded not down", () => {
    const probes = allHealthy();
    probes[0] = makeProbe("postgres", "degraded", "timeout");
    const snapshot = simulateSentinel(probes);
    expect(snapshot.overall_status).toBe("degraded");
    expect(snapshot.overall_status).not.toBe("down");
    expect(snapshot.components[0].status).toBe("degraded");
  });

  it("reason always set and ≤200 chars", () => {
    // Healthy case
    const s1 = simulateSentinel(allHealthy());
    expect(s1.reason).toBeTruthy();
    expect(s1.reason.length).toBeLessThanOrEqual(200);

    // Down case with long detail
    const probes = allHealthy();
    probes[0] = makeProbe("postgres", "down", "A".repeat(300));
    const s2 = simulateSentinel(probes);
    expect(s2.reason).toBeTruthy();
    expect(s2.reason.length).toBeLessThanOrEqual(200);

    // Many degraded components
    const manyDegraded = ALL_PROBE_NAMES.map((n) =>
      makeProbe(n, "degraded", "some issue with this component"),
    );
    const s3 = simulateSentinel(manyDegraded);
    expect(s3.reason).toBeTruthy();
    expect(s3.reason.length).toBeLessThanOrEqual(200);
  });

  it("snapshot has correct shape", () => {
    const snapshot = simulateSentinel(allHealthy());
    expect(snapshot).toHaveProperty("taken_at");
    expect(snapshot).toHaveProperty("overall_status");
    expect(snapshot).toHaveProperty("components");
    expect(snapshot).toHaveProperty("failing_count");
    expect(snapshot).toHaveProperty("reason");
    expect(typeof snapshot.taken_at).toBe("string");
    expect(["healthy", "degraded", "down", "unknown"]).toContain(snapshot.overall_status);
    expect(Array.isArray(snapshot.components)).toBe(true);
    expect(typeof snapshot.failing_count).toBe("number");
    expect(typeof snapshot.reason).toBe("string");

    // Each component has required fields
    for (const comp of snapshot.components) {
      expect(comp).toHaveProperty("name");
      expect(comp).toHaveProperty("status");
      expect(comp).toHaveProperty("latency_ms");
      expect(comp).toHaveProperty("detail");
      expect(["healthy", "degraded", "down"]).toContain(comp.status);
      expect(typeof comp.latency_ms).toBe("number");
    }
  });

  it("down takes precedence over degraded", () => {
    const probes = allHealthy();
    probes[2] = makeProbe("amendment_monitor", "degraded", "stale");
    probes[3] = makeProbe("writers_24h", "down", "5% error rate");
    const snapshot = simulateSentinel(probes);
    expect(snapshot.overall_status).toBe("down");
    expect(snapshot.reason).toContain("writers_24h");
  });

  it("stale-self detection injects sentinel_freshness when prior snapshot >15m old", () => {
    const probes = allHealthy();
    const priorSnapshot = {
      taken_at: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
      overall_status: "healthy",
    };
    const snapshot = simulateSentinel(probes, priorSnapshot);
    expect(snapshot.components).toHaveLength(10); // 9 + sentinel_freshness
    const freshness = snapshot.components.find((c) => c.name === "sentinel_freshness");
    expect(freshness).toBeDefined();
    expect(freshness!.status).toBe("degraded");
    expect(freshness!.detail).toContain("20m ago");
    expect(snapshot.overall_status).toBe("degraded");
  });

  it("no stale-self injection when prior snapshot is recent", () => {
    const probes = allHealthy();
    const priorSnapshot = {
      taken_at: new Date(Date.now() - 4 * 60 * 1000), // 4 min ago
      overall_status: "healthy",
    };
    const snapshot = simulateSentinel(probes, priorSnapshot);
    expect(snapshot.components).toHaveLength(9);
    expect(snapshot.components.find((c) => c.name === "sentinel_freshness")).toBeUndefined();
  });

  it("no stale-self injection when prior snapshot was not healthy", () => {
    const probes = allHealthy();
    const priorSnapshot = {
      taken_at: new Date(Date.now() - 20 * 60 * 1000),
      overall_status: "degraded",
    };
    const snapshot = simulateSentinel(probes, priorSnapshot);
    expect(snapshot.components).toHaveLength(9);
    expect(snapshot.overall_status).toBe("healthy");
  });
});

// ---------------------------------------------------------------------------
// F-042: source_health probe aggregation
// ---------------------------------------------------------------------------

describe("computeSourceHealthStatus", () => {
  it("no active sources → healthy (not degraded)", () => {
    const result = computeSourceHealthStatus([]);
    expect(result.status).toBe("healthy");
    expect(result.detail).toBe("no active sources to monitor");
  });

  it("all sources healthy → healthy", () => {
    const result = computeSourceHealthStatus([
      { source: "sam", status: "healthy" },
      { source: "govwin", status: "healthy" },
      { source: "govtribe", status: "healthy" },
    ]);
    expect(result.status).toBe("healthy");
  });

  it("one source degraded, rest healthy → degraded", () => {
    const result = computeSourceHealthStatus([
      { source: "sam", status: "healthy" },
      { source: "govwin", status: "degraded" },
      { source: "govtribe", status: "healthy" },
    ]);
    expect(result.status).toBe("degraded");
  });

  it("one source error → down", () => {
    const result = computeSourceHealthStatus([
      { source: "sam", status: "healthy" },
      { source: "govwin", status: "error" },
      { source: "govtribe", status: "healthy" },
    ]);
    expect(result.status).toBe("down");
  });

  it("missing_key treated as down (consistent with QA dashboard 'critical')", () => {
    const result = computeSourceHealthStatus([
      { source: "sam", status: "healthy" },
      { source: "govwin", status: "missing_key" },
      { source: "govtribe", status: "healthy" },
    ]);
    expect(result.status).toBe("down");
  });

  it("detail string contains all sources", () => {
    const result = computeSourceHealthStatus([
      { source: "sam", status: "healthy" },
      { source: "govwin", status: "degraded" },
      { source: "govtribe", status: "healthy" },
    ]);
    expect(result.detail).toContain("sam=healthy");
    expect(result.detail).toContain("govwin=degraded");
    expect(result.detail).toContain("govtribe=healthy");
  });
});

// ---------------------------------------------------------------------------
// F-2A: computePerSourceStatus — per-source health logic
// ---------------------------------------------------------------------------

describe("computePerSourceStatus", () => {
  const baseFeed = {
    source: "sam_gov",
    role: "primary",
    enabled: true,
    deprecated_at: null,
    last_sync_at: new Date(Date.now() - 2 * 3600000).toISOString(), // 2h ago
    sync_freshness_hours: 36,
    error_count: 0,
  };
  const envKeys = { sam_gov: true, govwin: true, govtribe: true, govtribe_zapier: true };

  it("deprecated source → null (skipped)", () => {
    expect(computePerSourceStatus({ ...baseFeed, deprecated_at: "2026-01-01" }, envKeys)).toBeNull();
  });

  it("disabled source → null (skipped)", () => {
    expect(computePerSourceStatus({ ...baseFeed, enabled: false }, envKeys)).toBeNull();
  });

  it("primary never synced → null (not yet operational)", () => {
    expect(computePerSourceStatus({ ...baseFeed, last_sync_at: null }, envKeys)).toBeNull();
  });

  it("missing API key → missing_key", () => {
    const result = computePerSourceStatus(baseFeed, { ...envKeys, sam_gov: false });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("missing_key");
  });

  it("primary synced recently, 0 errors → healthy", () => {
    const result = computePerSourceStatus(baseFeed, envKeys);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("healthy");
  });

  it("primary stale beyond threshold → error", () => {
    const stale = { ...baseFeed, last_sync_at: new Date(Date.now() - 48 * 3600000).toISOString() };
    const result = computePerSourceStatus(stale, envKeys);
    expect(result!.status).toBe("error");
    expect(result!.reason).toContain("no sync in");
  });

  it("primary with >3 errors → error", () => {
    const result = computePerSourceStatus({ ...baseFeed, error_count: 5 }, envKeys);
    expect(result!.status).toBe("error");
  });

  it("primary with 1-3 errors → degraded", () => {
    const result = computePerSourceStatus({ ...baseFeed, error_count: 2 }, envKeys);
    expect(result!.status).toBe("degraded");
  });

  it("enrichment source → healthy by default", () => {
    const enrichment = { ...baseFeed, source: "fpds", role: "enrichment" };
    const result = computePerSourceStatus(enrichment, envKeys);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("healthy");
  });

  it("primary never synced + missing key → null (not missing_key)", () => {
    const neverSynced = { ...baseFeed, source: "govwin", last_sync_at: null };
    const result = computePerSourceStatus(neverSynced, { ...envKeys, govwin: false });
    expect(result).toBeNull();
  });

  it("primary synced + missing key → missing_key (real issue)", () => {
    const synced = { ...baseFeed, source: "govwin", last_sync_at: new Date(Date.now() - 3600000).toISOString() };
    const result = computePerSourceStatus(synced, { ...envKeys, govwin: false });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("missing_key");
  });

  it("enrichment source with missing key → missing_key", () => {
    const enrichment = { ...baseFeed, source: "govtribe", role: "enrichment" };
    const result = computePerSourceStatus(enrichment, { ...envKeys, govtribe: false });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("missing_key");
  });
});

// ---------------------------------------------------------------------------
// F-042: writers_24h exclusion + rate computation
// ---------------------------------------------------------------------------

describe("computeWriters24hStatus", () => {
  it("only error.handler executions (all errored) → excluded → healthy (no other writers)", () => {
    const result = computeWriters24hStatus([
      { wf_name: "GDA.error.handler", errors: 20, total: 20 },
    ]);
    expect(result.status).toBe("healthy");
    expect(result.excludedNames).toContain("GDA.error.handler");
    expect(result.detail).toContain("0/0");
  });

  it("1000 executions, 10 errors (1%), no meta → degraded", () => {
    const result = computeWriters24hStatus([
      { wf_name: "GDA.cron.change-detector", errors: 10, total: 1000 },
    ]);
    expect(result.status).toBe("degraded");
    expect(result.detail).toContain("1.0%");
  });

  it("1000 executions, 50 errors (5%), no meta → down", () => {
    const result = computeWriters24hStatus([
      { wf_name: "GDA.cron.change-detector", errors: 50, total: 1000 },
    ]);
    expect(result.status).toBe("down");
    expect(result.detail).toContain("5.0%");
  });

  it("1000 execs, 20 real errors + 30 from GDA.error.handler → meta excluded → 2% → degraded", () => {
    const result = computeWriters24hStatus([
      { wf_name: "GDA.cron.change-detector", errors: 10, total: 500 },
      { wf_name: "GDA.cron.data-sync", errors: 10, total: 500 },
      { wf_name: "GDA.error.handler", errors: 30, total: 30 },
    ]);
    expect(result.status).toBe("degraded");
    expect(result.excludedNames).toContain("GDA.error.handler");
    expect(result.detail).toContain("20/1000");
  });

  it("excluded names match regex variants", () => {
    const names = [
      "GDA.error.handler",
      "My.Error.Handler",
      "some-error-handler-thing",
      "error_handler_v2",
    ];
    for (const name of names) {
      expect(
        WRITERS_24H_EXCLUDED_NAMES.some((re) => re.test(name)),
      ).toBe(true);
    }

    const nonMatching = [
      "GDA.cron.change-detector",
      "GDA.api.intel-feed",
      "GDA.cron.data-sync",
    ];
    for (const name of nonMatching) {
      expect(
        WRITERS_24H_EXCLUDED_NAMES.some((re) => re.test(name)),
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// F-035 Wave 2.5: secret expiry probe
// ---------------------------------------------------------------------------

describe("computeSecretExpiryStatus", () => {
  it("empty entries → degraded (no data)", () => {
    const result = computeSecretExpiryStatus([]);
    expect(result.status).toBe("degraded");
    expect(result.detail).toContain("no secret expiry data");
  });

  it("all secrets with null days_remaining (never-expiring) → healthy", () => {
    const entries: SecretExpiryEntry[] = [
      { name: "key1", days_remaining: null, source: "n8n_db" },
      { name: "key2", days_remaining: null, source: "inventory" },
    ];
    const result = computeSecretExpiryStatus(entries);
    expect(result.status).toBe("healthy");
    expect(result.detail).toContain("2 secrets checked");
  });

  it("secret <30d from expiry → degraded", () => {
    const entries: SecretExpiryEntry[] = [
      { name: "n8n_api_key:Devin-Rotated", days_remaining: 21, source: "n8n_db" },
      { name: "key2", days_remaining: null, source: "inventory" },
    ];
    const result = computeSecretExpiryStatus(entries);
    expect(result.status).toBe("degraded");
    expect(result.detail).toContain("Devin-Rotated");
    expect(result.detail).toContain("21d");
  });

  it("secret <7d from expiry → down (critical)", () => {
    const entries: SecretExpiryEntry[] = [
      { name: "n8n_api_key:expired-soon", days_remaining: 3, source: "n8n_db" },
      { name: "other", days_remaining: 60, source: "inventory" },
    ];
    const result = computeSecretExpiryStatus(entries);
    expect(result.status).toBe("down");
    expect(result.detail).toContain("critical <7d");
    expect(result.detail).toContain("3d");
  });

  it("already-expired secret (negative days) → down", () => {
    const entries: SecretExpiryEntry[] = [
      { name: "n8n_api_key:old-key", days_remaining: -5, source: "n8n_db" },
    ];
    const result = computeSecretExpiryStatus(entries);
    expect(result.status).toBe("down");
    expect(result.detail).toContain("-5d");
  });

  it("secrets >30d from expiry → healthy", () => {
    const entries: SecretExpiryEntry[] = [
      { name: "key1", days_remaining: 90, source: "n8n_db" },
      { name: "key2", days_remaining: 365, source: "inventory" },
    ];
    const result = computeSecretExpiryStatus(entries);
    expect(result.status).toBe("healthy");
  });
});

describe("parseInventoryExpiries", () => {
  it("parses expiry_date annotations from markdown", () => {
    const content = `
# Inventory
<!-- expiry_date: MY_KEY 2026-12-31 -->
<!-- expiry_date: OTHER_KEY unknown -->
<!-- expiry_date: THIRD_KEY 2026-06-09 -->
`;
    const results = parseInventoryExpiries(content);
    expect(results).toHaveLength(3);
    expect(results[0].name).toBe("MY_KEY");
    expect(results[0].expiry).toEqual(new Date("2026-12-31T00:00:00Z"));
    expect(results[1].name).toBe("OTHER_KEY");
    expect(results[1].expiry).toBeNull();
    expect(results[2].name).toBe("THIRD_KEY");
    expect(results[2].expiry).toEqual(new Date("2026-06-09T00:00:00Z"));
  });

  it("returns empty array for content with no annotations", () => {
    const results = parseInventoryExpiries("# Just a heading\nSome text");
    expect(results).toEqual([]);
  });

  it("handles never keyword", () => {
    const results = parseInventoryExpiries("<!-- expiry_date: MY_KEY never -->");
    expect(results).toHaveLength(1);
    expect(results[0].expiry).toBeNull();
  });
});
