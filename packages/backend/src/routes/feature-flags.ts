import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";

const router = Router();

/** GET /api/feature-flags — list all flags (public, used by frontend) */
router.get("/", async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    res.json(successEnvelope("feature-flags", "list", {}));
    return;
  }
  try {
    const { rows } = await pool.query(
      "SELECT flag_key, enabled, description FROM feature_flags ORDER BY flag_key"
    );
    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.flag_key] = row.enabled;
    }
    res.json(successEnvelope("feature-flags", "list", { flags, rows }));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("feature-flags", "list", {
        code: "DB_ERROR",
        message: (err as Error).message,
        detail: null,
      })
    );
  }
});

/** PUT /api/feature-flags/:key — toggle a flag (admin only) */
router.put("/:key", requireRole("admin"), async (req, res) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(
      errorEnvelope("feature-flags", "toggle", {
        code: "DB_NOT_CONFIGURED",
        message: "Database not configured",
        detail: null,
      })
    );
    return;
  }

  const { key } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    res.status(400).json(
      errorEnvelope("feature-flags", "toggle", {
        code: "VALIDATION_ERROR",
        message: "enabled must be a boolean",
        detail: null,
      })
    );
    return;
  }

  try {
    const { rowCount, rows } = await pool.query(
      "UPDATE feature_flags SET enabled = $1, updated_at = NOW() WHERE flag_key = $2 RETURNING *",
      [enabled, key]
    );
    if (!rowCount) {
      res.status(404).json(
        errorEnvelope("feature-flags", "toggle", {
          code: "NOT_FOUND",
          message: `Flag "${key}" not found`,
          detail: null,
        })
      );
      return;
    }
    res.json(successEnvelope("feature-flags", "toggle", rows[0]));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("feature-flags", "toggle", {
        code: "DB_ERROR",
        message: (err as Error).message,
        detail: null,
      })
    );
  }
});

export default router;
