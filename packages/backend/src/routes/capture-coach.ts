/**
 * Capture Coach Agent routes
 *
 * POST /trigger            — trigger analysis for a specific opportunity
 * GET  /analysis/:oppId    — get latest cached analysis for an opportunity
 * GET  /latest             — latest agent run results
 * GET  /history            — past agent runs
 */

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { isLLMAvailable } from "../lib/llm";
import { getPool } from "../lib/db";
import { triggerCaptureCoach, fetchCachedAnalysis } from "../agents/capture-coach";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/agents/capture-coach/trigger — trigger analysis for an opportunity
// ---------------------------------------------------------------------------
router.post("/trigger", requireRole("admin", "bd_manager"), async (req, res) => {
  const { opportunityId } = req.body as { opportunityId?: string };

  if (!opportunityId) {
    return res.status(400).json(
      errorEnvelope("capture-coach", "trigger", {
        code: "MISSING_OPPORTUNITY_ID",
        message: "opportunityId is required in request body",
        detail: null,
      }),
    );
  }

  if (!isLLMAvailable()) {
    return res.status(503).json(
      errorEnvelope("capture-coach", "trigger", {
        code: "LLM_UNAVAILABLE",
        message: "No LLM available — set OPENAI_API_KEY or ANTHROPIC_API_KEY",
        detail: null,
      }),
    );
  }

  try {
    const { result, analysis } = await triggerCaptureCoach(opportunityId, "manual");
    res.json(successEnvelope("capture-coach", "trigger", { ...result, analysis }));
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.includes("not found") ? 404 : 500;
    res.status(status).json(
      errorEnvelope("capture-coach", "trigger", {
        code: status === 404 ? "NOT_FOUND" : "AGENT_ERROR",
        message: msg,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/capture-coach/analysis/:oppId — get cached analysis
// ---------------------------------------------------------------------------
router.get("/analysis/:oppId", async (req, res) => {
  try {
    const analysis = await fetchCachedAnalysis(req.params.oppId);
    if (!analysis) {
      return res.json(
        successEnvelope("capture-coach", "analysis", {
          analysis: null,
          message: "No analysis yet. Click 'Generate Strategy' to run the Capture Coach.",
        }),
      );
    }
    res.json(successEnvelope("capture-coach", "analysis", { analysis }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("capture-coach", "analysis", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/capture-coach/latest — latest agent run results
// ---------------------------------------------------------------------------
router.get("/latest", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const result = await pool.query(
      `SELECT id, status, trigger, started_at, completed_at, duration_ms,
              items_processed, items_flagged, results_summary, error
       FROM agent_runs
       WHERE agent = 'capture-coach'
       ORDER BY started_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.json(
        successEnvelope("capture-coach", "latest", {
          run: null,
          message: "No runs yet.",
        }),
      );
    }

    res.json(successEnvelope("capture-coach", "latest", { run: result.rows[0] }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("capture-coach", "latest", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/capture-coach/history — past runs
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
       WHERE agent = 'capture-coach'
       ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );

    res.json(successEnvelope("capture-coach", "history", {
      runs: result.rows,
      count: result.rows.length,
    }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("capture-coach", "history", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
