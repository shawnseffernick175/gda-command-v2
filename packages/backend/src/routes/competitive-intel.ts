/**
 * Competitive Intel Agent routes
 *
 * POST /trigger  — manual trigger (admin/bd_manager only)
 * GET  /latest   — latest agent run results
 * GET  /history  — past agent runs
 */

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { isLLMAvailable } from "../lib/llm";
import { getPool } from "../lib/db";
import { runCompetitiveIntel } from "../agents/competitive-intel";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/agents/competitive-intel/trigger — manual trigger
// ---------------------------------------------------------------------------
router.post("/trigger", requireRole("admin", "bd_manager"), async (_req, res) => {
  if (!isLLMAvailable()) {
    return res.status(503).json(
      errorEnvelope("competitive-intel", "trigger", {
        code: "LLM_UNAVAILABLE",
        message: "No LLM available — set OPENAI_API_KEY or ANTHROPIC_API_KEY",
        detail: null,
      }),
    );
  }

  try {
    const result = await runCompetitiveIntel("manual");
    res.json(successEnvelope("competitive-intel", "trigger", result));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("competitive-intel", "trigger", {
        code: "AGENT_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/competitive-intel/latest — latest run results
// ---------------------------------------------------------------------------
router.get("/latest", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const result = await pool.query(
      `SELECT id, status, trigger, started_at, completed_at, duration_ms,
              items_processed, items_flagged, results_summary, error
       FROM agent_runs
       WHERE agent = 'competitive-intel'
       ORDER BY started_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.json(
        successEnvelope("competitive-intel", "latest", {
          run: null,
          message: "No runs yet. Trigger manually or wait for scheduled scan.",
        }),
      );
    }

    res.json(successEnvelope("competitive-intel", "latest", { run: result.rows[0] }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("competitive-intel", "latest", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/competitive-intel/history — past runs
// ---------------------------------------------------------------------------
router.get("/history", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const result = await pool.query(
      `SELECT id, status, trigger, started_at, completed_at, duration_ms,
              items_processed, items_flagged, results_summary, error
       FROM agent_runs
       WHERE agent = 'competitive-intel'
       ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );

    res.json(successEnvelope("competitive-intel", "history", {
      runs: result.rows,
      count: result.rows.length,
    }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("competitive-intel", "history", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
