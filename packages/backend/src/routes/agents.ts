/**
 * Agent management routes — status, config, triggers, runs.
 */

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import {
  getAgentStatus,
  getAgentRuns,
  getPendingApprovals,
  resolveApproval,
} from "../lib/agent-runner";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/agents — list all agents with latest run status
// ---------------------------------------------------------------------------
router.get("/", async (_req, res) => {
  try {
    const agents = await getAgentStatus();
    res.json(successEnvelope("gda-agents", "list", { agents, count: agents.length }));
  } catch (e) {
    log.error("agents_list_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-agents", "list", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/:name — single agent detail
// ---------------------------------------------------------------------------
router.get("/:name", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const configResult = await pool.query(
      "SELECT * FROM agent_config WHERE agent = $1",
      [req.params.name],
    );
    if (configResult.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-agents", "detail", {
          code: "NOT_FOUND",
          message: `Agent '${req.params.name}' not found`,
          detail: null,
        }),
      );
    }

    const runs = await getAgentRuns(req.params.name, 10);
    res.json(
      successEnvelope("gda-agents", "detail", {
        agent: configResult.rows[0],
        recent_runs: runs,
      }),
    );
  } catch (e) {
    log.error("agent_detail_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-agents", "detail", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/:name/runs — run history for an agent
// ---------------------------------------------------------------------------
router.get("/:name/runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const runs = await getAgentRuns(req.params.name, limit);
    res.json(successEnvelope("gda-agents", "runs", { runs, count: runs.length }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "runs", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/runs/recent — all recent agent runs across all agents
// ---------------------------------------------------------------------------
router.get("/runs/recent", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const result = await pool.query(
      "SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT $1",
      [limit],
    );
    res.json(successEnvelope("gda-agents", "recent-runs", { runs: result.rows, count: result.rows.length }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "recent-runs", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/:name/enable — enable an agent
// ---------------------------------------------------------------------------
router.post("/:name/enable", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const result = await pool.query(
      "UPDATE agent_config SET enabled = true, updated_at = NOW() WHERE agent = $1 RETURNING *",
      [req.params.name],
    );
    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-agents", "enable", {
          code: "NOT_FOUND",
          message: `Agent '${req.params.name}' not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("gda-agents", "enable", { agent: result.rows[0] }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "enable", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/:name/disable — disable an agent
// ---------------------------------------------------------------------------
router.post("/:name/disable", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const result = await pool.query(
      "UPDATE agent_config SET enabled = false, updated_at = NOW() WHERE agent = $1 RETURNING *",
      [req.params.name],
    );
    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-agents", "disable", {
          code: "NOT_FOUND",
          message: `Agent '${req.params.name}' not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("gda-agents", "disable", { agent: result.rows[0] }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "disable", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/agents/:name/config — update agent-specific config
// ---------------------------------------------------------------------------
router.put("/:name/config", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const { config, schedule } = req.body;
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [req.params.name];

    if (config !== undefined) {
      params.push(JSON.stringify(config));
      updates.push(`config = $${params.length}`);
    }
    if (schedule !== undefined) {
      params.push(schedule);
      updates.push(`schedule = $${params.length}`);
    }

    const result = await pool.query(
      `UPDATE agent_config SET ${updates.join(", ")} WHERE agent = $1 RETURNING *`,
      params,
    );
    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-agents", "config", {
          code: "NOT_FOUND",
          message: `Agent '${req.params.name}' not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("gda-agents", "config", { agent: result.rows[0] }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "config", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/approvals/pending — all pending approvals
// ---------------------------------------------------------------------------
router.get("/approvals/pending", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const agent = req.query.agent as string | undefined;
    const items = await getPendingApprovals({ type, agent });
    res.json(successEnvelope("gda-agents", "pending-approvals", { items, count: items.length }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "pending-approvals", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/approvals/:id/approve — approve an item
// ---------------------------------------------------------------------------
router.post("/approvals/:id/approve", requireRole("admin"), async (req, res) => {
  try {
    const { note } = req.body;
    const userId = (req as unknown as Record<string, unknown>).userId as string ?? "admin";
    await resolveApproval(req.params.id, "approved", userId, note);
    res.json(successEnvelope("gda-agents", "approve", { id: req.params.id, status: "approved" }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "approve", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/approvals/:id/reject — reject an item
// ---------------------------------------------------------------------------
router.post("/approvals/:id/reject", requireRole("admin"), async (req, res) => {
  try {
    const { note } = req.body;
    const userId = (req as unknown as Record<string, unknown>).userId as string ?? "admin";
    await resolveApproval(req.params.id, "rejected", userId, note);
    res.json(successEnvelope("gda-agents", "reject", { id: req.params.id, status: "rejected" }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "reject", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/approvals/stats — approval counts by type/status
// ---------------------------------------------------------------------------
router.get("/approvals/stats", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not available");

    const result = await pool.query(`
      SELECT
        type,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
        COUNT(*) AS total
      FROM approval_queue
      GROUP BY type
      ORDER BY type
    `);
    const totalPending = result.rows.reduce((s, r) => s + parseInt(r.pending), 0);
    res.json(successEnvelope("gda-agents", "approval-stats", {
      by_type: result.rows,
      total_pending: totalPending,
    }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-agents", "approval-stats", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
