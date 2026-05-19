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
      govwin: process.env.GOVWIN_API_KEY,
      govtribe: process.env.GOVTRIBE_API_KEY,
    };

    const sources = rows.map((r: Record<string, unknown>) => {
      const apiKeyName = r.source === "sam_gov" ? "SAM_API_KEY"
        : r.source === "govwin" ? "GOVWIN_API_KEY"
        : r.source === "govtribe" ? "GOVTRIBE_API_KEY"
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

    const overall = erroring.length > 0
      ? "degraded"
      : active.length === 0
        ? "error"
        : "operational";

    res.json(
      successEnvelope(
        "GDA.qa.source-health",
        "list",
        {
          overall,
          total: rows.length,
          active: active.length,
          deprecated: deprecated.length,
          erroring: erroring.length,
          sources,
        },
        { count: rows.length }
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

export default router;
