// ---------------------------------------------------------------------------
// Health Sentinel — single source of truth for system status.
// Probes 9 components, writes a snapshot row, returns overall status.
// Cron-driven only (no setInterval). Called by n8n every 5 minutes.
// ---------------------------------------------------------------------------

import { getPool } from "./db";
import { isEmbeddingAvailable } from "./embeddings";
import { log } from "./logger";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentStatus = "healthy" | "degraded" | "down";
export type OverallStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ProbeResult {
  name: string;
  status: ComponentStatus;
  latency_ms: number;
  detail: string;
}

export interface Snapshot {
  id?: number;
  taken_at: string;
  overall_status: OverallStatus;
  components: ProbeResult[];
  failing_count: number;
  reason: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Per-probe timeout helper (2s hard cap via AbortController)
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 2000;

async function withTimeout<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<{ value: T; ms: number }> {
  const controller = new AbortController();
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException(`Probe '${label}' timed out after ${PROBE_TIMEOUT_MS}ms`, "AbortError"));
    }, PROBE_TIMEOUT_MS);
  });
  try {
    const value = await Promise.race([fn(controller.signal), timeoutPromise]);
    return { value, ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Individual probes
// ---------------------------------------------------------------------------

async function probePostgres(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const pool = getPool();
    if (!pool) return { name: "postgres", status: "down", latency_ms: 0, detail: "pool not configured" };
    const { ms } = await withTimeout("postgres", async () => {
      await pool.query("SELECT 1");
    });
    return { name: "postgres", status: "healthy", latency_ms: ms, detail: "ok" };
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timeout" : String((err as Error).message);
    return { name: "postgres", status: "down", latency_ms: Date.now() - start, detail: msg };
  }
}

function getN8nPool(): pg.Pool | null {
  const url = process.env.N8N_DATABASE_URL;
  if (!url) return null;
  return new pg.Pool({ connectionString: url, max: 1, idleTimeoutMillis: 5000, connectionTimeoutMillis: 2000 });
}

async function probeN8nWorkflow(
  name: string,
  workflowId: string,
  maxAgeMinutes: number,
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const n8nPool = getN8nPool();
    if (!n8nPool) {
      return { name, status: "degraded", latency_ms: 0, detail: "N8N_DATABASE_URL not set" };
    }
    try {
      const { value: row, ms } = await withTimeout(name, async () => {
        const result = await n8nPool.query(
          `SELECT status, "stoppedAt" FROM execution_entity
           WHERE "workflowId" = $1 ORDER BY id DESC LIMIT 1`,
          [workflowId],
        );
        return result.rows[0] ?? null;
      });

      if (!row) {
        return { name, status: "degraded", latency_ms: ms, detail: "no executions found" };
      }

      const stoppedAt = row.stoppedAt ? new Date(row.stoppedAt) : null;
      const ageMinutes = stoppedAt ? (Date.now() - stoppedAt.getTime()) / 60000 : Infinity;

      if (row.status !== "success") {
        return { name, status: "down", latency_ms: ms, detail: `last status=${row.status}` };
      }
      if (ageMinutes > maxAgeMinutes) {
        return {
          name,
          status: "degraded",
          latency_ms: ms,
          detail: `last success ${Math.round(ageMinutes)}m ago (max ${maxAgeMinutes}m)`,
        };
      }
      return { name, status: "healthy", latency_ms: ms, detail: `last success ${Math.round(ageMinutes)}m ago` };
    } finally {
      await n8nPool.end();
    }
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timeout" : String((err as Error).message);
    return { name, status: "degraded", latency_ms: Date.now() - start, detail: msg };
  }
}

// Workflows excluded from writers_24h error-rate calculation.
// GDA.error.handler is a meta workflow that fires when OTHER workflows fail —
// counting its executions double-counts errors and inflates the rate.
export const WRITERS_24H_EXCLUDED_NAMES: RegExp[] = [
  /\.error\.handler$/i,
  /error[_-]handler/i,
];

/** Pure logic for writers_24h: filter out excluded workflows, compute error rate & status. */
export function computeWriters24hStatus(
  rows: { wf_name: string; errors: number; total: number }[],
  excludedPatterns: RegExp[] = WRITERS_24H_EXCLUDED_NAMES,
): { status: ComponentStatus; detail: string; excludedNames: string[] } {
  let totalAll = 0;
  let errorsAll = 0;
  const excludedNames: string[] = [];

  for (const row of rows) {
    const isExcluded = excludedPatterns.some((re) => re.test(row.wf_name));
    if (isExcluded) {
      excludedNames.push(row.wf_name);
    } else {
      totalAll += row.total;
      errorsAll += row.errors;
    }
  }

  const rate = totalAll > 0 ? (errorsAll / totalAll) * 100 : 0;
  let status: ComponentStatus;
  if (rate >= 5) {
    status = "down";
  } else if (rate >= 1) {
    status = "degraded";
  } else {
    status = "healthy";
  }
  return { status, detail: `${rate.toFixed(1)}% error rate (${errorsAll}/${totalAll})`, excludedNames };
}

/** Pure logic for source_health: aggregate per-source rows into overall status. */
export function computeSourceHealthStatus(
  rows: { source: string; status: string }[],
): { status: ComponentStatus; detail: string } {
  if (rows.length === 0) {
    return { status: "degraded", detail: "no source health snapshots recorded yet" };
  }
  const summary = rows.map((r) => `${r.source}=${r.status}`).join(", ");
  let status: ComponentStatus;
  if (rows.some((r) => r.status === "error" || r.status === "missing_key")) {
    status = "down";
  } else if (rows.some((r) => r.status === "degraded")) {
    status = "degraded";
  } else {
    status = "healthy";
  }
  return { status, detail: summary };
}

async function probeWriters24h(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const n8nPool = getN8nPool();
    if (!n8nPool) {
      return { name: "writers_24h", status: "degraded", latency_ms: 0, detail: "N8N_DATABASE_URL not set" };
    }
    try {
      const { value: rows, ms } = await withTimeout("writers_24h", async () => {
        const result = await n8nPool.query(
          `SELECT
             w.name AS wf_name,
             COUNT(*) FILTER (WHERE e.status = 'error') AS errors,
             COUNT(*) AS total
           FROM execution_entity e
           JOIN workflow_entity w ON e."workflowId" = w.id
           WHERE e."startedAt" > NOW() - INTERVAL '24 hours'
             AND e."workflowId" NOT IN ('LPUSYd4Vpph1Qg7n')
           GROUP BY w.name`,
        );
        return result.rows as { wf_name: string; errors: string; total: string }[];
      });

      const parsed = rows.map((r) => ({ wf_name: r.wf_name, errors: Number(r.errors), total: Number(r.total) }));
      const { status, detail, excludedNames } = computeWriters24hStatus(parsed);

      if (excludedNames.length > 0) {
        log.info("writers_24h_excluded", { excluded: excludedNames });
      }

      return { name: "writers_24h", status, latency_ms: ms, detail };
    } finally {
      await n8nPool.end();
    }
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timeout" : String((err as Error).message);
    return { name: "writers_24h", status: "degraded", latency_ms: Date.now() - start, detail: msg };
  }
}

async function probeSamApi(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.SAM_API_KEY;
    if (!apiKey) {
      return { name: "sam_api", status: "degraded", latency_ms: 0, detail: "SAM_API_KEY not set" };
    }
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${apiKey}&limit=1&postedFrom=01/01/2025&postedTo=12/31/2025`;
    const { value: status, ms } = await withTimeout("sam_api", async (signal) => {
      const res = await fetch(url, { signal });
      return res.status;
    });
    if (status === 200) {
      return { name: "sam_api", status: "healthy", latency_ms: ms, detail: "HTTP 200" };
    }
    return { name: "sam_api", status: "degraded", latency_ms: ms, detail: `HTTP ${status}` };
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timeout" : String((err as Error).message);
    return { name: "sam_api", status: "degraded", latency_ms: Date.now() - start, detail: msg };
  }
}

async function probeEmbeddings(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    if (isEmbeddingAvailable()) {
      return { name: "embeddings", status: "healthy", latency_ms: Date.now() - start, detail: "OPENAI_API_KEY set" };
    }
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        `SELECT COUNT(*) AS cnt FROM knowledge_documents
         WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'`,
      );
      const stale = Number(result.rows[0].cnt);
      if (stale > 0) {
        return { name: "embeddings", status: "degraded", latency_ms: Date.now() - start, detail: `${stale} pending docs >1h, no API key` };
      }
    }
    return { name: "embeddings", status: "healthy", latency_ms: Date.now() - start, detail: "no API key but no pending docs" };
  } catch (err) {
    return { name: "embeddings", status: "degraded", latency_ms: Date.now() - start, detail: String((err as Error).message) };
  }
}

async function probeDisk(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const output = execSync("df -P /", { timeout: 2000 }).toString();
    const lines = output.trim().split("\n");
    if (lines.length < 2) {
      return { name: "disk", status: "degraded", latency_ms: Date.now() - start, detail: "could not parse df output" };
    }
    const parts = lines[1].split(/\s+/);
    const usageStr = parts[4]?.replace("%", "");
    const usage = parseInt(usageStr ?? "0", 10);
    if (usage >= 85) {
      return { name: "disk", status: "degraded", latency_ms: Date.now() - start, detail: `${usage}% used (threshold 85%)` };
    }
    return { name: "disk", status: "healthy", latency_ms: Date.now() - start, detail: `${usage}% used` };
  } catch (err) {
    return { name: "disk", status: "degraded", latency_ms: Date.now() - start, detail: String((err as Error).message) };
  }
}

async function probeSourceHealth(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const pool = getPool();
    if (!pool) {
      return { name: "source_health", status: "degraded", latency_ms: 0, detail: "DB pool not available" };
    }
    const result = await pool.query(
      `SELECT DISTINCT ON (source) source, status, snapshot_at
       FROM source_health_snapshots
       ORDER BY source, snapshot_at DESC`,
    );
    const rows = result.rows as { source: string; status: string }[];
    const { status, detail } = computeSourceHealthStatus(rows);
    return { name: "source_health", status, latency_ms: Date.now() - start, detail };
  } catch (err) {
    return { name: "source_health", status: "degraded", latency_ms: Date.now() - start, detail: String((err as Error).message) };
  }
}

// ---------------------------------------------------------------------------
// Secret expiry probe — checks n8n API key JWTs + manual inventory
// ---------------------------------------------------------------------------

export interface SecretExpiryEntry {
  name: string;
  days_remaining: number | null; // null = unknown
  source: "n8n_db" | "inventory";
}

/** Decode a JWT's exp claim without a library. Returns epoch seconds or null. */
function decodeJwtExp(jwt: string): number | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Parse expiry_date annotations from the inventory markdown file. */
export function parseInventoryExpiries(content: string): { name: string; expiry: Date | null }[] {
  const results: { name: string; expiry: Date | null }[] = [];
  const regex = /<!--\s*expiry_date:\s*(\S+)\s+(\S+)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const dateStr = match[2];
    if (dateStr === "unknown" || dateStr === "never") {
      results.push({ name, expiry: null });
    } else {
      const d = new Date(dateStr + "T00:00:00Z");
      results.push({ name, expiry: isNaN(d.getTime()) ? null : d });
    }
  }
  return results;
}

export function computeSecretExpiryStatus(
  entries: SecretExpiryEntry[],
): { status: ComponentStatus; detail: string } {
  const expiring = entries.filter((e) => e.days_remaining !== null && e.days_remaining < 30);
  const critical = entries.filter((e) => e.days_remaining !== null && e.days_remaining < 7);

  if (critical.length > 0) {
    const names = critical.map((e) => `${e.name}(${e.days_remaining}d)`).join(", ");
    return { status: "down", detail: `critical <7d: ${names}` };
  }
  if (expiring.length > 0) {
    const names = expiring.map((e) => `${e.name}(${e.days_remaining}d)`).join(", ");
    return { status: "degraded", detail: `expiring <30d: ${names}` };
  }
  if (entries.length === 0) {
    return { status: "degraded", detail: "no secret expiry data available" };
  }
  return { status: "healthy", detail: `${entries.length} secrets checked, all ok` };
}

async function probeSecretExpiry(): Promise<ProbeResult> {
  const start = Date.now();
  const entries: SecretExpiryEntry[] = [];

  // 1. Query n8n DB for API key JWT expiries
  try {
    const n8nPool = getN8nPool();
    if (n8nPool) {
      try {
        const { value: rows } = await withTimeout("secret_expiry_n8n", async () => {
          const result = await n8nPool.query(
            `SELECT id, label, "apiKey" FROM user_api_keys`,
          );
          return result.rows as { id: string; label: string; apiKey: string }[];
        });
        const nowEpoch = Date.now() / 1000;
        for (const row of rows) {
          const exp = decodeJwtExp(row.apiKey);
          if (exp !== null) {
            const daysRemaining = Math.floor((exp - nowEpoch) / 86400);
            entries.push({ name: `n8n_api_key:${row.label}`, days_remaining: daysRemaining, source: "n8n_db" });
          } else {
            entries.push({ name: `n8n_api_key:${row.label}`, days_remaining: null, source: "n8n_db" });
          }
        }
      } finally {
        await n8nPool.end();
      }
    }
  } catch (err) {
    log.warn("secret_expiry_n8n_error", { error: String((err as Error).message) });
  }

  // 2. Read inventory file for manually-tracked expiries
  try {
    const inventoryPath = path.resolve(__dirname, "../../../../docs/audit/secret-expiry-inventory.md");
    if (fs.existsSync(inventoryPath)) {
      const content = fs.readFileSync(inventoryPath, "utf-8");
      const manualEntries = parseInventoryExpiries(content);
      const nowMs = Date.now();
      for (const entry of manualEntries) {
        if (entry.expiry) {
          const daysRemaining = Math.floor((entry.expiry.getTime() - nowMs) / 86400000);
          entries.push({ name: entry.name, days_remaining: daysRemaining, source: "inventory" });
        } else {
          entries.push({ name: entry.name, days_remaining: null, source: "inventory" });
        }
      }
    }
  } catch (err) {
    log.warn("secret_expiry_inventory_error", { error: String((err as Error).message) });
  }

  const { status, detail } = computeSecretExpiryStatus(entries);
  return { name: "secret_expiry", status, latency_ms: Date.now() - start, detail };
}

// ---------------------------------------------------------------------------
// Rollup + reason
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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSentinel(): Promise<Snapshot> {
  const probes = await Promise.allSettled([
    probePostgres(),
    probeN8nWorkflow("n8n_canary", "LPUSYd4Vpph1Qg7n", 15),
    probeN8nWorkflow("amendment_monitor", "1o8h7yGhLKLoNP0S", 26 * 60),
    probeWriters24h(),
    probeSamApi(),
    probeEmbeddings(),
    probeDisk(),
    probeSourceHealth(),
    probeSecretExpiry(),
  ]);

  const components: ProbeResult[] = probes.map((p, i) => {
    if (p.status === "fulfilled") return p.value;
    const names = ["postgres", "n8n_canary", "amendment_monitor", "writers_24h", "sam_api", "embeddings", "disk", "source_health", "secret_expiry"];
    return {
      name: names[i],
      status: "degraded" as ComponentStatus,
      latency_ms: 0,
      detail: `probe rejected: ${String(p.reason)}`,
    };
  });

  // Stale-self detection: if prior snapshot is >15 min old and was healthy, add synthetic component
  try {
    const pool = getPool();
    if (pool) {
      const prior = await pool.query(
        `SELECT taken_at, overall_status FROM system_health_snapshots ORDER BY taken_at DESC LIMIT 1`,
      );
      if (prior.rows.length > 0) {
        const priorAt = new Date(prior.rows[0].taken_at);
        const ageMinutes = (Date.now() - priorAt.getTime()) / 60000;
        if (ageMinutes > 15 && prior.rows[0].overall_status === "healthy") {
          components.push({
            name: "sentinel_freshness",
            status: "degraded",
            latency_ms: 0,
            detail: `prior snapshot ${Math.round(ageMinutes)}m ago, expected ≤5m`,
          });
        }
      }
    }
  } catch {
    // non-fatal — skip freshness check
  }

  const { overall, reason, failCount } = rollup(components);

  const snapshot: Snapshot = {
    taken_at: new Date().toISOString(),
    overall_status: overall,
    components,
    failing_count: failCount,
    reason,
  };

  // Write snapshot to DB
  try {
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        `INSERT INTO system_health_snapshots (taken_at, overall_status, components, failing_count, reason, meta)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [snapshot.taken_at, snapshot.overall_status, JSON.stringify(snapshot.components), snapshot.failing_count, snapshot.reason, null],
      );
      snapshot.id = result.rows[0].id;
    }
  } catch (err) {
    log.error("sentinel_write_error", { error: String((err as Error).message) });
  }

  log.info("sentinel_snapshot", {
    overall: snapshot.overall_status,
    failing: snapshot.failing_count,
    reason: snapshot.reason,
  });

  return snapshot;
}
