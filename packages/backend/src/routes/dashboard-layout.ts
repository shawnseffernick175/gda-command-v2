/**
 * Dashboard layout routes — per-user widget arrangement persistence.
 */

import { Router, Request, Response } from "express";
import { getPool } from "../lib/db";
import { successEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";

const router = Router();

// GET /api/dashboard/layout — fetch current user's layout
router.get("/layout", async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = req.user?.userId;
  if (!pool || !userId) {
    res.json(successEnvelope("dashboard", "get-layout", { layout: null }));
    return;
  }

  try {
    const { rows } = await pool.query(
      "SELECT layout FROM dashboard_layouts WHERE user_id = $1",
      [userId]
    );
    res.json(successEnvelope("dashboard", "get-layout", { layout: rows[0]?.layout ?? null }));
  } catch (err) {
    log.error("dashboard_layout_fetch_error", { error: (err as Error).message, userId });
    res.json(successEnvelope("dashboard", "get-layout", { layout: null }));
  }
});

// PUT /api/dashboard/layout — save current user's layout
router.put("/layout", async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = req.user?.userId;
  if (!pool || !userId) {
    res.status(400).json({ success: false, error: { message: "No database or user" } });
    return;
  }

  const { layout } = req.body;
  if (!Array.isArray(layout)) {
    res.status(400).json({ success: false, error: { message: "layout must be an array" } });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO dashboard_layouts (user_id, layout, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET layout = $2::jsonb, updated_at = NOW()`,
      [userId, JSON.stringify(layout)]
    );
    log.info("dashboard_layout_saved", { userId, widgetCount: layout.length });
    res.json(successEnvelope("dashboard", "save-layout", { saved: true }));
  } catch (err) {
    log.error("dashboard_layout_save_error", { error: (err as Error).message, userId });
    res.status(500).json({ success: false, error: { message: "Failed to save layout" } });
  }
});

// DELETE /api/dashboard/layout — reset to default
router.delete("/layout", async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = req.user?.userId;
  if (!pool || !userId) {
    res.status(400).json({ success: false, error: { message: "No database or user" } });
    return;
  }

  try {
    await pool.query("DELETE FROM dashboard_layouts WHERE user_id = $1", [userId]);
    log.info("dashboard_layout_reset", { userId });
    res.json(successEnvelope("dashboard", "reset-layout", { reset: true }));
  } catch (err) {
    log.error("dashboard_layout_reset_error", { error: (err as Error).message, userId });
    res.status(500).json({ success: false, error: { message: "Failed to reset layout" } });
  }
});

export default router;
