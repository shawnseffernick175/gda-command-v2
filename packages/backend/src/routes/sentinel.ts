// ---------------------------------------------------------------------------
// Sentinel Routes — system health status API
// GET  /api/sentinel/current  — latest snapshot (no auth, like /health)
// GET  /api/sentinel/history  — time-series (auth-protected via JWT)
// POST /api/sentinel/run      — trigger sentinel (auth-protected via x-gda-key)
// ---------------------------------------------------------------------------

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { authMiddleware } from "../lib/auth";
import { runSentinel } from "../lib/health-sentinel";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";

const router = Router();

router.get("/current", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json(
        successEnvelope("GDA.sentinel", "current", {
          overall_status: "unknown",
          reason: "database not configured",
          components: [],
          failing_count: 0,
          taken_at: null,
        }),
      );
    }

    const result = await pool.query(
      `SELECT id, taken_at, overall_status, components, failing_count, reason, meta
       FROM system_health_snapshots
       ORDER BY taken_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.json(
        successEnvelope("GDA.sentinel", "current", {
          overall_status: "unknown",
          reason: "no snapshots yet",
          components: [],
          failing_count: 0,
          taken_at: null,
        }),
      );
    }

    const row = result.rows[0];
    res.json(
      successEnvelope("GDA.sentinel", "current", {
        id: row.id,
        taken_at: row.taken_at,
        overall_status: row.overall_status,
        components: row.components,
        failing_count: row.failing_count,
        reason: row.reason,
        meta: row.meta,
      }),
    );
  } catch (err) {
    log.error("sentinel_current_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.sentinel", "current", {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch current sentinel status",
        detail: null,
      }),
    );
  }
});

router.get("/history", authMiddleware, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json(successEnvelope("GDA.sentinel", "history", { snapshots: [] }));
    }

    const hours = Math.min(Math.max(parseInt(String(req.query.hours ?? "24"), 10) || 24, 1), 168);

    const result = await pool.query(
      `SELECT id, taken_at, overall_status, components, failing_count, reason
       FROM system_health_snapshots
       WHERE taken_at > NOW() - ($1 || ' hours')::INTERVAL
       ORDER BY taken_at DESC`,
      [String(hours)],
    );

    res.json(
      successEnvelope("GDA.sentinel", "history", {
        hours,
        count: result.rows.length,
        snapshots: result.rows,
      }),
    );
  } catch (err) {
    log.error("sentinel_history_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.sentinel", "history", {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch sentinel history",
        detail: null,
      }),
    );
  }
});

router.post("/run", async (req, res) => {
  // Auth check: x-gda-key header
  const key = process.env.GDA_WEBHOOK_KEY;
  if (!key) {
    return res.status(503).json(
      errorEnvelope("GDA.sentinel", "run", {
        code: "NOT_CONFIGURED",
        message: "GDA_WEBHOOK_KEY not set",
        detail: null,
      }),
    );
  }
  const provided = req.headers["x-gda-key"] as string;
  if (provided !== key) {
    return res.status(401).json(
      errorEnvelope("GDA.sentinel", "run", {
        code: "UNAUTHORIZED",
        message: "Invalid or missing x-gda-key header",
        detail: null,
      }),
    );
  }

  try {
    const snapshot = await runSentinel();
    res.json(successEnvelope("GDA.sentinel", "run", snapshot));
  } catch (err) {
    log.error("sentinel_run_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.sentinel", "run", {
        code: "INTERNAL_ERROR",
        message: "Sentinel run failed",
        detail: (err as Error).message,
      }),
    );
  }
});

export default router;
