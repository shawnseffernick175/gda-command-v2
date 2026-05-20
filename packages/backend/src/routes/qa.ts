import { Router } from "express";
import { successEnvelope, notConfiguredEnvelope, errorEnvelope } from "../middleware/envelope";
import { callWebhook, webhookConfig, listFailedExecutions, fetchWorkflows, apiConfig } from "../lib/n8n-client";
import {
  READONLY_CHECKS,
  DRYRUN_CHECKS,
  allowedDryRunIds,
  classify,
  summarize,
  recommend,
  type CheckRow,
} from "../lib/checks";


const router = Router();

function timeoutMs(): number {
  const t = parseInt(process.env.QA_CHECK_TIMEOUT_MS ?? "15000", 10);
  return Number.isFinite(t) && t > 0 ? t : 15000;
}

async function runSet(checks: typeof READONLY_CHECKS): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];
  for (const c of checks) {
    const r = await callWebhook(c.path, c.body, { timeoutMs: timeoutMs() });
    const cls = classify(r.http, r.body, r.error);
    rows.push({
      id: c.id,
      label: c.label,
      path: c.path,
      http: r.http,
      ms: r.ms,
      bytes: r.bytes || 0,
      status: cls.status,
      tone: cls.tone,
      error: r.error || null,
    });
  }
  return rows;
}

/**
 * GET /api/qa/health
 * If N8N_BASE_URL is configured, runs real health checks against n8n webhooks.
 * Otherwise, returns in-memory mock data.
 */
router.get("/health", async (_req, res) => {
  const wh = webhookConfig();

  if (wh.missing.length > 0) {
    // Fall back to mock data when n8n is not configured
    return res.json(
      successEnvelope(
        "GDA.gateway.qa-health",
        "health",
        {
          overall: "unknown",
          summary: { total: 0, passed: 0, failed: 0, warned: 0 },
          rows: [],
          nextAction: "Configure n8n to run health checks.",
          source: "db",
        },
        {
          checkCount: 0,
          hint: "Set N8N_BASE_URL in .env to run real health checks against n8n.",
        }
      )
    );
  }

  try {
    const rows = await runSet(READONLY_CHECKS);
    const summary = summarize(rows);
    const overall =
      summary.failed > 0 || summary.authFails > 0
        ? "critical"
        : summary.empty > 0
          ? "degraded"
          : "operational";
    res.json(
      successEnvelope(
        "GDA.gateway.qa-health",
        "health",
        {
          overall,
          summary,
          rows,
          nextAction: recommend(rows),
          source: "live",
        },
        { checkCount: rows.length }
      )
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.gateway.qa-health", "health", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Health check failed",
        detail: null,
      })
    );
  }
});

/**
 * POST /api/qa/dry-run
 * Runs dry-run checks against write-capable workflows with dryRun:true.
 */
router.post("/dry-run", async (req, res) => {
  const wh = webhookConfig();
  if (wh.missing.length > 0) {
    return res.json(
      notConfiguredEnvelope("GDA.gateway.qa-dry-run", "dryRun", wh.missing, {
        allowedIds: allowedDryRunIds(),
      })
    );
  }

  let checks = DRYRUN_CHECKS;
  if (req.body && Array.isArray(req.body.ids)) {
    const allowed = new Set(allowedDryRunIds());
    const requested: string[] = req.body.ids;
    const rejected = requested.filter((id) => !allowed.has(id));
    if (rejected.length > 0) {
      return res.status(400).json(
        errorEnvelope("GDA.gateway.qa-dry-run", "dryRun", {
          code: "NOT_ALLOWED",
          message: `Only approved dry-run ids are accepted: ${[...allowed].join(", ")}`,
          detail: null,
        })
      );
    }
    const ids = new Set(requested);
    checks = DRYRUN_CHECKS.filter((c) => ids.has(c.id));
  }

  const safeChecks = checks.map((c) => ({
    ...c,
    body: { ...c.body, dryRun: true },
  }));
  const rows = await runSet(safeChecks);
  res.json(
    successEnvelope(
      "GDA.gateway.qa-dry-run",
      "dryRun",
      { summary: summarize(rows), rows, nextAction: recommend(rows) },
      { policy: "dryRun:true enforced server-side" },
      true
    )
  );
});

/**
 * Converts a raw n8n execution into a plain-English failure record.
 */
function plainEnglish(exec: Record<string, unknown>): Record<string, unknown> {
  const wd = exec.workflowData as Record<string, unknown> | undefined;
  const wf = exec.workflow as Record<string, unknown> | undefined;
  const wfName =
    wd?.name ?? exec.workflowName ?? wf?.name ?? exec.workflowId ?? "unknown workflow";
  const rd = (exec.data as Record<string, unknown>)?.resultData as Record<string, unknown> | undefined;
  const errObj = rd?.error as Record<string, unknown> | undefined;
  const execErr = exec.error as Record<string, unknown> | undefined;

  // Extract error message from multiple possible locations in the execution data
  const errMsg =
    errObj?.message ??
    execErr?.message ??
    exec.message ??
    "No message returned by n8n";

  // Extract description for additional context (e.g. "Authorization data is wrong!")
  const errDesc = errObj?.description ?? execErr?.description ?? null;

  // Extract the node that failed from the error object or resultData
  const errNode = errObj?.node as Record<string, unknown> | undefined;
  const failedNode =
    errNode?.name ?? rd?.lastNodeExecuted ?? exec.lastNodeExecuted ?? null;

  // Build a combined message: if we have a description that differs from the
  // main message, append it for context
  let message = typeof errMsg === "string" ? errMsg.slice(0, 300) : "See execution detail";
  if (errDesc && typeof errDesc === "string") {
    const cleanDesc = errDesc.replace(/<[^>]+>/g, "").slice(0, 200);
    if (cleanDesc && !message.includes(cleanDesc)) {
      message = `${message} — ${cleanDesc}`;
    }
  }

  return {
    id: exec.id ?? null,
    workflowName: wfName,
    workflowId: exec.workflowId ?? wd?.id ?? null,
    failedNode,
    message: message.slice(0, 500),
    startedAt: exec.startedAt ?? exec.createdAt ?? null,
    stoppedAt: exec.stoppedAt ?? exec.finishedAt ?? null,
  };
}

/**
 * GET /api/qa/latest-failures
 * If N8N_API_BASE + N8N_API_KEY are configured, fetches real failed executions from n8n.
 * Otherwise, returns in-memory mock data.
 */
router.get("/latest-failures", async (req, res) => {
  const cfg = apiConfig();

  if (cfg.missing.length > 0) {
    // Fall back to mock data
    return res.json(
      successEnvelope(
        "GDA.gateway.failures-latest",
        "list",
        { rows: [], source: "db" },
        {
          count: 0,
          unresolvedCount: 0,
          hint: "Set N8N_API_BASE and N8N_API_KEY in .env to fetch real failures from n8n.",
        }
      )
    );
  }

  const limitRaw = parseInt((req.query.limit as string) ?? "25", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 250 ? limitRaw : 25;

  try {
    const [out, wfResult] = await Promise.all([
      listFailedExecutions(limit),
      fetchWorkflows(250),
    ]);
    if (!out.configured) {
      return res.json(
        notConfiguredEnvelope("GDA.gateway.failures-latest", "list", out.missing ?? cfg.missing)
      );
    }
    if (out.error) {
      return res.json(
        errorEnvelope("GDA.gateway.failures-latest", "list", {
          code: "UPSTREAM_ERROR",
          message: "n8n REST API returned an error",
          detail: out.error,
        })
      );
    }
    const wfNameMap = new Map<string, string>();
    for (const wf of wfResult.workflows) {
      const w = wf as Record<string, unknown>;
      if (w.id && w.name) wfNameMap.set(String(w.id), String(w.name));
    }
    const rows = (out.executions || []).map((e) => {
      const row = plainEnglish(e as Record<string, unknown>);
      if (row.workflowId && wfNameMap.has(String(row.workflowId))) {
        const resolvedName = wfNameMap.get(String(row.workflowId))!;
        if (row.workflowName === row.workflowId || row.workflowName === "unknown workflow") {
          row.workflowName = resolvedName;
        }
      }
      return row;
    });
    return res.json(
      successEnvelope(
        "GDA.gateway.failures-latest",
        "list",
        { rows, source: "live" },
        { count: rows.length, limit }
      )
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.gateway.failures-latest", "list", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Failed to fetch executions",
        detail: null,
      })
    );
  }
});

/**
 * GET /api/qa/sam-verify
 * Returns the latest SAM verification run results.
 */
router.get("/sam-verify", async (req, res) => {
  const { getPool } = await import("../lib/db");
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(
      errorEnvelope("GDA.qa.sam-verify", "list", {
        code: "NO_DB",
        message: "Database not available",
        detail: null,
      })
    );
  }

  const limitRaw = parseInt((req.query.limit as string) ?? "10", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM sam_verification_runs ORDER BY ran_at DESC LIMIT $1`,
      [limit],
    );

    const latest = rows[0] ?? null;
    const overall = latest
      ? latest.status === "pass" ? "operational" : latest.status === "fail" ? "degraded" : "error"
      : "unknown";

    res.json(
      successEnvelope(
        "GDA.qa.sam-verify",
        "list",
        {
          overall,
          latest,
          history: rows,
          source: "db",
        },
        { count: rows.length, limit }
      )
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.qa.sam-verify", "list", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Failed to fetch verification runs",
        detail: null,
      })
    );
  }
});

/**
 * GET /api/qa/source-health
 * Returns the health status of all government data source feeds.
 * Shows which sources are active, deprecated, erroring, or missing API keys.
 */
router.get("/source-health", async (_req, res) => {
  const { getPool } = await import("../lib/db");
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(
      errorEnvelope("GDA.qa.source-health", "list", {
        code: "NO_DB",
        message: "Database not available",
        detail: null,
      })
    );
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, source, name, base_url, enabled, last_sync_at, last_sync_count,
              error_count, deprecated_at, deprecation_reason, updated_at
       FROM gov_source_feeds ORDER BY source`,
    );

    // Determine overall health
    const active = rows.filter((r: Record<string, unknown>) => r.enabled && !r.deprecated_at);
    const deprecated = rows.filter((r: Record<string, unknown>) => r.deprecated_at);
    const erroring = active.filter((r: Record<string, unknown>) => (r.error_count as number) > 0);

    // Check for missing API keys
    const envKeys: Record<string, string | undefined> = {
      sam_gov: process.env.SAM_API_KEY,
      govwin: process.env.GOVWIN_CLIENT_ID && process.env.GOVWIN_CLIENT_SECRET &&
              process.env.GOVWIN_USERNAME && process.env.GOVWIN_PASSWORD
              ? "configured" : undefined,
      govtribe: process.env.GOVTRIBE_API_KEY,
      govtribe_zapier: process.env.GOVTRIBE_API_KEY,
    };

    const sources = rows.map((r: Record<string, unknown>) => {
      const apiKeyName = r.source === "sam_gov" ? "SAM_API_KEY"
        : r.source === "govwin" ? "GOVWIN_CLIENT_ID, GOVWIN_CLIENT_SECRET, GOVWIN_USERNAME, GOVWIN_PASSWORD"
        : r.source === "govtribe" || r.source === "govtribe_zapier" ? "GOVTRIBE_API_KEY"
        : null;

      let status: string;
      if (r.deprecated_at) {
        status = "deprecated";
      } else if (!r.enabled) {
        status = "disabled";
      } else if (apiKeyName && !envKeys[r.source as string]) {
        status = "missing_key";
      } else if ((r.error_count as number) > 3) {
        status = "error";
      } else if ((r.error_count as number) > 0) {
        status = "degraded";
      } else {
        status = "healthy";
      }

      return {
        id: r.id,
        source: r.source,
        name: r.name,
        enabled: r.enabled,
        status,
        last_sync_at: r.last_sync_at,
        last_sync_count: r.last_sync_count,
        error_count: r.error_count,
        deprecated_at: r.deprecated_at,
        deprecation_reason: r.deprecation_reason,
        api_key_configured: apiKeyName ? !!envKeys[r.source as string] : null,
      };
    });

    // Low-confidence incumbent enrichment counter for review queue
    let low_confidence_incumbents = 0;
    try {
      const lcResult = await pool.query(
        `SELECT COUNT(*) AS count FROM opportunities WHERE incumbent_confidence = 'low'`,
      );
      low_confidence_incumbents = parseInt(lcResult.rows[0]?.count ?? "0", 10);
    } catch { /* column may not exist yet */ }

    // GovTribe MCP credit cap status
    let govtribe_credits = null;
    try {
      const { getGovTribeCreditCapStatus } = await import("../lib/gov-sources");
      govtribe_credits = await getGovTribeCreditCapStatus();
    } catch { /* credit ledger table may not exist yet */ }

    // Latest snapshot per source (from source_health_snapshots table)
    let latest_snapshots: Record<string, unknown>[] = [];
    let overall_status: string = "unknown";
    try {
      const snapResult = await pool.query(
        `SELECT DISTINCT ON (source)
           source, role, status, last_record_at,
           records_last_7d, records_last_30d, calls_last_7d,
           error_count_7d, status_reason, meta, snapshot_at
         FROM source_health_snapshots
         ORDER BY source, snapshot_at DESC`,
      );
      latest_snapshots = snapResult.rows;

      // Compute overall_status from latest snapshots
      const primarySnaps = latest_snapshots.filter((s: Record<string, unknown>) =>
        s.role === "primary" && !["deprecated", "planned"].includes(s.status as string));
      const enrichSnaps = latest_snapshots.filter((s: Record<string, unknown>) =>
        s.role === "enrichment" && !["deprecated", "planned"].includes(s.status as string));

      if (primarySnaps.some((s: Record<string, unknown>) => s.status === "error" || s.status === "missing_key")) {
        overall_status = "critical";
      } else if (primarySnaps.some((s: Record<string, unknown>) => s.status === "degraded") ||
                 enrichSnaps.some((s: Record<string, unknown>) => s.status === "error")) {
        overall_status = "degraded";
      } else if (latest_snapshots.length > 0) {
        overall_status = "all_healthy";
      }
    } catch { /* table may not exist yet */ }

    const overall = erroring.length > 0
      ? "degraded"
      : active.length === 0
        ? "error"
        : "operational";

    const hints: string[] = [];
    if (low_confidence_incumbents > 0) {
      hints.push(`${low_confidence_incumbents} opportunities with low-confidence incumbent matches awaiting review`);
    }
    if (govtribe_credits?.monthlyAlertTriggered) {
      hints.push(
        `GovTribe MCP credits at ${govtribe_credits.monthlyUsed}/${govtribe_credits.monthlyCap} this month (${Math.round((govtribe_credits.monthlyUsed / govtribe_credits.monthlyCap) * 100)}%)` +
        (govtribe_credits.monthlyStopTriggered ? " — POLLING STOPPED" : " — approaching limit"),
      );
    }

    res.json(
      successEnvelope(
        "GDA.qa.source-health",
        "list",
        {
          overall,
          overall_status,
          total: rows.length,
          active: active.length,
          deprecated: deprecated.length,
          erroring: erroring.length,
          sources,
          latest_snapshots,
          low_confidence_incumbents,
          govtribe_credits,
        },
        {
          count: rows.length,
          hint: hints.length > 0 ? hints.join("; ") : undefined,
        }
      )
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.qa.source-health", "list", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Failed to fetch source health",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/qa/govtribe-health — automated GovTribe MCP health check
// Same pattern as SAM verify — no manual curl needed.
// ---------------------------------------------------------------------------
router.get("/govtribe-health", async (_req, res) => {
  try {
    const { checkGovTribeHealth } = await import("../lib/gov-sources");
    const result = await checkGovTribeHealth();
    res.json(
      successEnvelope("GDA.qa.govtribe-health", "check", result, {
        hint: result.status === "healthy"
          ? `GovTribe MCP operational — ${result.toolCount} tools, ${result.latencyMs}ms`
          : result.error ?? "Check GOVTRIBE_API_KEY",
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.qa.govtribe-health", "check", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Failed to check GovTribe health",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/qa/source-health/snapshot — compute & store source health snapshot
// Called by n8n cron (daily 7am ET) or manually via API.
// Auth: x-gda-key header (same as ingest endpoints).
// ---------------------------------------------------------------------------
router.post("/source-health/snapshot", async (req, res) => {
  // Auth check
  const key = process.env.GDA_WEBHOOK_KEY;
  if (!key) {
    return res.status(503).json(
      errorEnvelope("GDA.qa.source-health-snapshot", "create", {
        code: "NOT_CONFIGURED",
        message: "GDA_WEBHOOK_KEY not set",
        detail: null,
      })
    );
  }
  const provided = req.headers["x-gda-key"] as string;
  if (provided !== key) {
    return res.status(401).json(
      errorEnvelope("GDA.qa.source-health-snapshot", "create", {
        code: "UNAUTHORIZED",
        message: "Invalid or missing x-gda-key header",
        detail: null,
      })
    );
  }

  const { getPool } = await import("../lib/db");
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(
      errorEnvelope("GDA.qa.source-health-snapshot", "create", {
        code: "NO_DB",
        message: "Database not available",
        detail: null,
      })
    );
  }

  try {
    const snapshotAt = new Date().toISOString();

    // Get all source feeds with their roles
    const { rows: feeds } = await pool.query(
      `SELECT id, source, name, enabled, last_sync_at, last_sync_count,
              error_count, deprecated_at, deprecation_reason,
              COALESCE(role, 'primary') AS role,
              COALESCE(sync_freshness_hours, 36) AS sync_freshness_hours
       FROM gov_source_feeds ORDER BY source`,
    );

    const results: Array<{
      source: string;
      role: string;
      status: string;
      last_record_at: string | null;
      records_last_7d: number;
      records_last_30d: number;
      calls_last_7d: number;
      error_count_7d: number;
      status_reason: string | null;
      meta: Record<string, unknown>;
    }> = [];

    for (const feed of feeds) {
      const src = feed.source as string;
      const role = feed.role as string;
      const meta: Record<string, unknown> = {};

      // Record counts from opportunities table
      let lastRecordAt: string | null = null;
      let records7d = 0;
      let records30d = 0;

      try {
        const lrResult = await pool.query(
          `SELECT MAX(created_at) AS last_at FROM opportunities WHERE data_source = $1`,
          [src],
        );
        lastRecordAt = lrResult.rows[0]?.last_at ?? null;
      } catch { /* column/table may not exist */ }

      try {
        const r7 = await pool.query(
          `SELECT COUNT(*) AS cnt FROM opportunities WHERE data_source = $1 AND created_at > NOW() - INTERVAL '7 days'`,
          [src],
        );
        records7d = parseInt(r7.rows[0]?.cnt ?? "0", 10);

        const r30 = await pool.query(
          `SELECT COUNT(*) AS cnt FROM opportunities WHERE data_source = $1 AND created_at > NOW() - INTERVAL '30 days'`,
          [src],
        );
        records30d = parseInt(r30.rows[0]?.cnt ?? "0", 10);
      } catch { /* column may not exist */ }

      // Enrichment call counts
      let calls7d = 0;
      let errorCount7d = 0;

      if (role === "enrichment") {
        try {
          const callResult = await pool.query(
            `SELECT COUNT(*) AS cnt FROM enrichment_call_log WHERE source = $1 AND called_at > NOW() - INTERVAL '7 days'`,
            [src],
          );
          calls7d = parseInt(callResult.rows[0]?.cnt ?? "0", 10);

          const errResult = await pool.query(
            `SELECT COUNT(*) AS cnt FROM enrichment_call_log WHERE source = $1 AND called_at > NOW() - INTERVAL '7 days' AND success = false`,
            [src],
          );
          errorCount7d = parseInt(errResult.rows[0]?.cnt ?? "0", 10);
        } catch { /* table may not exist */ }
      } else {
        // feed.error_count is cumulative, not 7-day windowed.
        // Match GET /source-health threshold logic: >3 = error, >0 = degraded
        errorCount7d = (feed.error_count as number) ?? 0;
      }

      // Check for missing API keys
      const envKeys: Record<string, string | undefined> = {
        sam_gov: process.env.SAM_API_KEY,
        govwin: process.env.GOVWIN_CLIENT_ID && process.env.GOVWIN_CLIENT_SECRET &&
                process.env.GOVWIN_USERNAME && process.env.GOVWIN_PASSWORD
                ? "configured" : undefined,
        govtribe: process.env.GOVTRIBE_API_KEY,
        govtribe_zapier: process.env.GOVTRIBE_API_KEY,
      };
      const envKeyNames: Record<string, string> = {
        sam_gov: "SAM_API_KEY",
        govwin: "GOVWIN_CLIENT_ID, GOVWIN_CLIENT_SECRET, GOVWIN_USERNAME, GOVWIN_PASSWORD",
        govtribe: "GOVTRIBE_API_KEY",
        govtribe_zapier: "GOVTRIBE_API_KEY",
      };

      // Status logic
      let status: string;
      let statusReason: string | null = null;

      if (feed.deprecated_at) {
        status = "deprecated";
        statusReason = (feed.deprecation_reason as string) ?? "Source deprecated";
      } else if (!feed.enabled) {
        status = "planned";
        statusReason = "Source not yet enabled";
      } else if (src in envKeys && !envKeys[src]) {
        status = "missing_key";
        statusReason = `API key not configured: set ${envKeyNames[src]} env var`;
      } else if (role === "primary") {
        // Primary source status logic
        const lastSync = feed.last_sync_at ? new Date(feed.last_sync_at as string) : null;
        const hoursSinceSync = lastSync
          ? (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
          : Infinity;
        const freshnessThreshold = parseInt(feed.sync_freshness_hours as string, 10) || 36;

        if (hoursSinceSync > freshnessThreshold) {
          status = "error";
          statusReason = `No sync in ${Math.round(hoursSinceSync)} hours (threshold: ${freshnessThreshold}h)`;
        } else if (errorCount7d > 3) {
          status = "error";
          statusReason = `${errorCount7d} cumulative errors (threshold: >3)`;
        } else if (errorCount7d > 0) {
          status = "degraded";
          statusReason = `${errorCount7d} cumulative errors (below error threshold of >3)`;
        } else if (records7d === 0) {
          status = "degraded";
          statusReason = "Sync ran but zero new records in last 7 days — may need investigation";
        } else {
          status = "healthy";
        }
      } else {
        // Enrichment source status logic
        if (errorCount7d > 0 && calls7d > 0 && errorCount7d / calls7d > 0.5) {
          status = "error";
          statusReason = `${errorCount7d}/${calls7d} calls failed in last 7 days (>${Math.round(50)}% failure rate)`;
        } else if (errorCount7d > 0) {
          status = "degraded";
          statusReason = `${errorCount7d} failed calls in last 7 days (${calls7d} total)`;
        } else {
          // Zero calls is normal for enrichment — don't flag as error
          status = "healthy";
        }
      }

      // Add source-specific meta
      if (src === "govtribe" || src === "govtribe_zapier") {
        try {
          const { getGovTribeCreditCapStatus } = await import("../lib/gov-sources");
          meta.credit_cap_status = await getGovTribeCreditCapStatus();
        } catch { /* credit ledger may not exist */ }
      }
      if (src === "sam_gov") {
        try {
          const verifyResult = await pool.query(
            `SELECT status, sam_count, db_count_before, gap_before_pct FROM sam_verification_runs ORDER BY ran_at DESC LIMIT 1`,
          );
          if (verifyResult.rows[0]) {
            meta.verify_gap_pct = verifyResult.rows[0].gap_before_pct;
            meta.verify_status = verifyResult.rows[0].status;
            meta.verify_sam_count = verifyResult.rows[0].sam_count;
            meta.verify_gda_count = verifyResult.rows[0].db_count_before;
          }
        } catch { /* sam_verification_runs may not exist */ }
      }

      results.push({
        source: src,
        role,
        status,
        last_record_at: lastRecordAt,
        records_last_7d: records7d,
        records_last_30d: records30d,
        calls_last_7d: calls7d,
        error_count_7d: errorCount7d,
        status_reason: statusReason,
        meta,
      });

      // Write snapshot row
      await pool.query(
        `INSERT INTO source_health_snapshots
           (id, snapshot_at, source, role, status, last_record_at,
            records_last_7d, records_last_30d, calls_last_7d, error_count_7d,
            status_reason, meta)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          snapshotAt, src, role, status, lastRecordAt,
          records7d, records30d, calls7d, errorCount7d,
          statusReason, JSON.stringify(meta),
        ],
      );
    }

    // Compute overall status
    const primarySources = results.filter((r) => r.role === "primary");
    const enrichmentSources = results.filter((r) => r.role === "enrichment");
    const activePrimary = primarySources.filter((r) => !["deprecated", "planned"].includes(r.status));
    const activeEnrichment = enrichmentSources.filter((r) => !["deprecated", "planned"].includes(r.status));

    let overallStatus: string;
    if (activePrimary.some((r) => r.status === "error" || r.status === "missing_key")) {
      overallStatus = "critical";
    } else if (activePrimary.some((r) => r.status === "degraded") || activeEnrichment.some((r) => r.status === "error")) {
      overallStatus = "degraded";
    } else {
      overallStatus = "all_healthy";
    }

    res.json(
      successEnvelope("GDA.qa.source-health-snapshot", "create", {
        snapshot_at: snapshotAt,
        overall_status: overallStatus,
        sources: results,
      }, {
        count: results.length,
        hint: overallStatus === "all_healthy"
          ? "All sources operational"
          : overallStatus === "degraded"
            ? "Some sources degraded — check status_reason"
            : "Critical: primary source(s) in error or missing keys",
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.qa.source-health-snapshot", "create", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Failed to create snapshot",
        detail: null,
      })
    );
  }
});

export default router;
