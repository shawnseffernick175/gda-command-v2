/**
 * Admin ingest routes — manual trigger, recent runs, and status.
 * Auth: requires JWT with role=admin.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { requireRole } from "../../lib/auth";
import { successEnvelope, errorEnvelope } from "../../middleware/envelope";
import { log } from "../../lib/logger";
import { runIngest, getRegisteredSources } from "../../ingest/framework/registry";
import { getRecentRuns, getIngestStatus } from "../../ingest/framework/run_logger";

const router = Router();

// POST /v3/admin/ingest/run/:source — manual trigger
router.post("/run/:source", requireRole("admin"), async (req: Request, res: Response) => {
  const sourceKey = req.params.source;
  const registered = getRegisteredSources();

  if (!registered.includes(sourceKey)) {
    res.status(404).json(errorEnvelope("admin-ingest", "run", {
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source: ${sourceKey}. Available: ${registered.join(", ")}`,
      detail: null,
    }));
    return;
  }

  try {
    log.info("admin_ingest_trigger", {
      source: sourceKey,
      triggeredBy: req.user?.userId,
    });

    const { runId, result, durationMs } = await runIngest(sourceKey);

    res.json(successEnvelope("admin-ingest", "run", {
      run_id: String(runId),
      source_key: sourceKey,
      rows_inserted: result.inserted,
      rows_updated: result.updated,
      rows_skipped: result.skipped,
      status: "success",
      duration_ms: durationMs,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("admin_ingest_trigger_error", { source: sourceKey, error: message });

    res.status(500).json(errorEnvelope("admin-ingest", "run", {
      code: "INGEST_FAILED",
      message,
      detail: null,
    }));
  }
});

// GET /v3/admin/ingest/runs — recent runs
router.get("/runs", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;

    const runs = await getRecentRuns(source, isNaN(limit) ? 50 : limit);

    res.json(successEnvelope("admin-ingest", "runs", { runs }));
  } catch (err) {
    log.error("admin_ingest_runs_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("admin-ingest", "runs", {
      code: "QUERY_FAILED",
      message: (err as Error).message,
      detail: null,
    }));
  }
});

// GET /v3/admin/ingest/status — last successful run per source
router.get("/status", requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const status = await getIngestStatus();
    const registered = getRegisteredSources();

    res.json(successEnvelope("admin-ingest", "status", {
      registered_sources: registered,
      status,
    }));
  } catch (err) {
    log.error("admin_ingest_status_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("admin-ingest", "status", {
      code: "QUERY_FAILED",
      message: (err as Error).message,
      detail: null,
    }));
  }
});

export default router;
