/**
 * Controlled Fix Agent routes
 *
 * POST /trigger          — manually trigger failure scan + AI diagnosis
 * GET  /pending-fixes    — list fix proposals awaiting resolution
 * GET  /proposals        — all fix proposals (history)
 * POST /resolve/:id      — approve or reject a fix proposal
 * GET  /latest           — latest agent run results
 * GET  /history          — past agent runs
 */

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import {
  triggerControlledFix,
  fetchPendingFixes,
  fetchAllProposals,
  resolveFixProposal,
} from "../agents/controlled-fix";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/agents/fix-runner/trigger — scan for failures + diagnose
// ---------------------------------------------------------------------------
router.post("/trigger", requireRole("admin"), async (_req, res) => {
  try {
    const result = await triggerControlledFix("manual");
    res.json(successEnvelope("fix-runner", "trigger", result));
  } catch (e) {
    const msg = (e as Error).message;
    res.status(500).json(
      errorEnvelope("fix-runner", "trigger", {
        code: "AGENT_ERROR",
        message: msg,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/fix-runner/pending-fixes — proposals awaiting resolution
// ---------------------------------------------------------------------------
router.get("/pending-fixes", async (_req, res) => {
  try {
    const fixes = await fetchPendingFixes();
    res.json(
      successEnvelope("fix-runner", "pending-fixes", {
        fixes,
        count: fixes.length,
      }),
    );
  } catch (e) {
    res.status(500).json(
      errorEnvelope("fix-runner", "pending-fixes", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/fix-runner/proposals — all proposals (history)
// ---------------------------------------------------------------------------
router.get("/proposals", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const proposals = await fetchAllProposals(limit);
    res.json(
      successEnvelope("fix-runner", "proposals", {
        proposals,
        count: proposals.length,
      }),
    );
  } catch (e) {
    res.status(500).json(
      errorEnvelope("fix-runner", "proposals", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/fix-runner/resolve/:id — approve or reject a fix
// ---------------------------------------------------------------------------
router.post("/resolve/:id", requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { action, note } = req.body as { action?: string; note?: string };

  if (action !== "approve" && action !== "reject") {
    return res.status(400).json(
      errorEnvelope("fix-runner", "resolve", {
        code: "INVALID_ACTION",
        message: 'action must be "approve" or "reject"',
        detail: null,
      }),
    );
  }

  try {
    const user = (req as unknown as Record<string, unknown>).user as { email?: string } | undefined;
    const decidedBy = user?.email ?? "admin";
    const result = await resolveFixProposal(id, action, decidedBy, note);
    res.json(successEnvelope("fix-runner", "resolve", { proposal: result, action }));
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.includes("not found") ? 404 : 500;
    res.status(status).json(
      errorEnvelope("fix-runner", "resolve", {
        code: status === 404 ? "NOT_FOUND" : "INTERNAL",
        message: msg,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/fix-runner/latest — latest agent run
// ---------------------------------------------------------------------------
router.get("/latest", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const result = await pool.query(
      `SELECT id, status, trigger, started_at, completed_at, duration_ms,
              items_processed, items_flagged, results_summary, error
       FROM agent_runs
       WHERE agent = 'fix-runner'
       ORDER BY started_at DESC LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.json(
        successEnvelope("fix-runner", "latest", { run: null, message: "No runs yet." }),
      );
    }

    res.json(successEnvelope("fix-runner", "latest", { run: result.rows[0] }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("fix-runner", "latest", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/fix-runner/history — past runs
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
       WHERE agent = 'fix-runner'
       ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );

    res.json(
      successEnvelope("fix-runner", "history", {
        runs: result.rows,
        count: result.rows.length,
      }),
    );
  } catch (e) {
    res.status(500).json(
      errorEnvelope("fix-runner", "history", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
