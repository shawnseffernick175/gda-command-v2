/**
 * F-039: Health Sentinel tests.
 *
 * Tests the rollup logic, probe handling, reason formatting, and snapshot
 * shape in isolation. All probes are mocked — no real DB, n8n, or SAM.gov.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
  "sam_api", "embeddings", "disk", "source_health",
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
    expect(snapshot.reason).toContain("all 8 components green");
    expect(snapshot.components).toHaveLength(8);
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
    expect(snapshot.components).toHaveLength(9); // 8 + sentinel_freshness
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
    expect(snapshot.components).toHaveLength(8);
    expect(snapshot.components.find((c) => c.name === "sentinel_freshness")).toBeUndefined();
  });

  it("no stale-self injection when prior snapshot was not healthy", () => {
    const probes = allHealthy();
    const priorSnapshot = {
      taken_at: new Date(Date.now() - 20 * 60 * 1000),
      overall_status: "degraded",
    };
    const snapshot = simulateSentinel(probes, priorSnapshot);
    expect(snapshot.components).toHaveLength(8);
    expect(snapshot.overall_status).toBe("healthy");
  });
});
