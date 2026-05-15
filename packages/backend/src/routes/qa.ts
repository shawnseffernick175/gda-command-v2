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
  const errMsg =
    errObj?.message ??
    execErr?.message ??
    exec.message ??
    "No message returned by n8n";
  return {
    id: exec.id ?? null,
    workflowName: wfName,
    workflowId: exec.workflowId ?? wd?.id ?? null,
    failedNode: rd?.lastNodeExecuted ?? exec.lastNodeExecuted ?? null,
    message:
      typeof errMsg === "string" ? errMsg.slice(0, 500) : "See execution detail",
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

export default router;
