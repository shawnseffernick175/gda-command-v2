/**
 * Audit log routes — admin-only view of system activity.
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { successEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";

const router = Router();

// GET /api/audit — list audit log entries (admin only)
router.get("/", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.json(successEnvelope("audit", "list", { entries: [], total: 0 }));
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;
  const action = req.query.action as string | undefined;
  const resourceType = req.query.resource_type as string | undefined;
  const userId = req.query.user_id as string | undefined;

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(action);
    }
    if (resourceType) {
      conditions.push(`resource_type = $${paramIdx++}`);
      params.push(resourceType);
    }
    if (userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_log ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const { rows } = await pool.query(
      `SELECT id, user_id, user_email, action, resource_type, resource_id, details, ip_address, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset]
    );

    res.json(successEnvelope("audit", "list", {
      entries: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (err) {
    log.error("audit_log_fetch_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: { message: "Failed to fetch audit log" } });
  }
});

// GET /api/audit/stats — summary statistics
router.get("/stats", requireRole("admin"), async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.json(successEnvelope("audit", "stats", { totalEntries: 0, topActions: [], topUsers: [], recentActivity: [] }));
    return;
  }

  try {
    const [totalRes, actionsRes, usersRes, recentRes] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM audit_log"),
      pool.query(
        `SELECT action, COUNT(*) as count FROM audit_log
         GROUP BY action ORDER BY count DESC LIMIT 10`
      ),
      pool.query(
        `SELECT user_email, COUNT(*) as count FROM audit_log
         WHERE user_email IS NOT NULL
         GROUP BY user_email ORDER BY count DESC LIMIT 10`
      ),
      pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM audit_log
         WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at) ORDER BY date DESC`
      ),
    ]);

    res.json(successEnvelope("audit", "stats", {
      totalEntries: parseInt(totalRes.rows[0].total),
      topActions: actionsRes.rows,
      topUsers: usersRes.rows,
      recentActivity: recentRes.rows,
    }));
  } catch (err) {
    log.error("audit_stats_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: { message: "Failed to fetch audit stats" } });
  }
});

export default router;
