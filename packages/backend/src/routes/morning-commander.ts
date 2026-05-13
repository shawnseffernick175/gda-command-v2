/**
 * Morning Commander routes
 *
 * POST /api/agents/morning-commander/trigger  — manual trigger
 * GET  /api/agents/morning-commander/latest   — latest briefing
 * GET  /api/agents/morning-commander/history   — briefing history
 */

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { isLLMAvailable } from "../lib/llm";
import { executeMorningCommander } from "../agents/morning-commander";

const router = Router();

// ---------------------------------------------------------------------------
// POST /trigger — generate a new briefing now
// ---------------------------------------------------------------------------
router.post("/trigger", requireRole("admin", "bd_manager"), async (_req, res) => {
  try {
    if (!isLLMAvailable()) {
      res.status(503).json(
        errorEnvelope("morning-commander", "trigger", {
          code: "LLM_UNAVAILABLE",
          message: "No AI model configured — set OPENAI_API_KEY or ANTHROPIC_API_KEY",
          detail: null,
        }),
      );
      return;
    }

    const result = await executeMorningCommander("manual");
    res.json(successEnvelope("morning-commander", "trigger", result));
  } catch (e) {
    log.error("morning_commander_trigger_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("morning-commander", "trigger", {
        code: "AGENT_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /latest — most recent briefing
// ---------------------------------------------------------------------------
router.get("/latest", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("morning-commander", "latest", {
          code: "DB_UNAVAILABLE",
          message: "Database not available",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `SELECT id, date, headline, key_metrics, alerts, action_items, market_snapshot, generated_at
       FROM morning_briefings ORDER BY generated_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      res.json(successEnvelope("morning-commander", "latest", { briefing: null }));
      return;
    }

    res.json(successEnvelope("morning-commander", "latest", { briefing: result.rows[0] }));
  } catch (e) {
    log.error("morning_commander_latest_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("morning-commander", "latest", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /history — past briefings
// ---------------------------------------------------------------------------
router.get("/history", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("morning-commander", "history", {
          code: "DB_UNAVAILABLE",
          message: "Database not available",
          detail: null,
        }),
      );
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const result = await pool.query(
      `SELECT id, date, headline, key_metrics, generated_at
       FROM morning_briefings ORDER BY generated_at DESC LIMIT $1`,
      [limit],
    );

    res.json(successEnvelope("morning-commander", "history", {
      briefings: result.rows,
      count: result.rows.length,
    }));
  } catch (e) {
    log.error("morning_commander_history_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("morning-commander", "history", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
