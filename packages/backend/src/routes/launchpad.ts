// ---------------------------------------------------------------------------
// Launchpad Routes — daily-driver flags + intel API
// GET  /api/launchpad/flags         — active flags (default ou_tag=envision)
// POST /api/launchpad/flags/:id/dismiss — dismiss a flag (x-gda-key auth)
// GET  /api/launchpad/daily-intel   — news items for a given date
// ---------------------------------------------------------------------------

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { isValidOuTag, defaultOuTag } from "../lib/ou-tag";
import { verifyToken } from "../lib/auth";
import { log } from "../lib/logger";

const router = Router();

const SEVERITY_ORDER = `CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END`;

router.get("/flags", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json(successEnvelope("GDA.launchpad", "flags", { flags: [] }));
    }

    const rawTag = req.query.ou_tag ?? defaultOuTag();
    const ouTag = isValidOuTag(rawTag) ? rawTag : defaultOuTag();

    const result = await pool.query(
      `SELECT id, ou_tag, flag_key, severity, title, detail, due_date,
              doctrine_anchor, source_url, is_dismissed, dismissed_at,
              created_at, updated_at
       FROM launchpad_flags
       WHERE is_dismissed = FALSE AND ou_tag = $1
       ORDER BY ${SEVERITY_ORDER}, due_date ASC NULLS LAST, created_at ASC`,
      [ouTag],
    );

    // Touch a read timestamp so Sentinel can verify Launchpad is alive
    try {
      await pool.query(
        `UPDATE launchpad_flags SET updated_at = NOW() WHERE id = (SELECT id FROM launchpad_flags LIMIT 1)`,
      );
    } catch { /* non-fatal */ }

    res.json(successEnvelope("GDA.launchpad", "flags", { flags: result.rows }));
  } catch (err) {
    log.error("launchpad_flags_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.launchpad", "flags", {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch launchpad flags",
        detail: null,
      }),
    );
  }
});

router.post("/flags/:id/dismiss", async (req, res) => {
  // Accept either x-gda-key (machine/n8n callers) or JWT (browser callers)
  let authorized = false;

  // Check x-gda-key first (for n8n / machine callers)
  const key = process.env.GDA_WEBHOOK_KEY;
  const provided = req.headers["x-gda-key"] as string | undefined;
  if (key && provided === key) {
    authorized = true;
  }

  // Fall back to JWT auth (for browser callers)
  if (!authorized) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = verifyToken(authHeader.slice(7));
        if (payload?.userId) authorized = true;
      } catch { /* invalid token */ }
    }
    // Dev mode: AUTH_REQUIRED=false → allow without token
    if (!authorized && process.env.AUTH_REQUIRED !== "true") {
      authorized = true;
    }
  }

  if (!authorized) {
    return res.status(401).json(
      errorEnvelope("GDA.launchpad", "dismiss", {
        code: "UNAUTHORIZED",
        message: "Invalid or missing authorization",
        detail: null,
      }),
    );
  }

  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("GDA.launchpad", "dismiss", {
          code: "NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
    }

    const flagId = req.params.id;
    const result = await pool.query(
      `UPDATE launchpad_flags
       SET is_dismissed = TRUE, dismissed_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, flag_key, is_dismissed, dismissed_at`,
      [flagId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("GDA.launchpad", "dismiss", {
          code: "NOT_FOUND",
          message: `Flag ${flagId} not found`,
          detail: null,
        }),
      );
    }

    res.json(successEnvelope("GDA.launchpad", "dismiss", result.rows[0]));
  } catch (err) {
    log.error("launchpad_dismiss_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.launchpad", "dismiss", {
        code: "INTERNAL_ERROR",
        message: "Failed to dismiss flag",
        detail: null,
      }),
    );
  }
});

router.get("/daily-intel", async (req, res) => {
  try {
    const pool = getPool();

    // news_items table does not exist yet — return empty array
    if (pool) {
      try {
        const tableCheck = await pool.query(
          `SELECT EXISTS (
             SELECT FROM information_schema.tables
             WHERE table_name = 'news_items'
           ) AS exists`,
        );
        if (tableCheck.rows[0]?.exists) {
          const dateParam = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
          const result = await pool.query(
            `SELECT * FROM news_items
             WHERE DATE(created_at AT TIME ZONE 'America/New_York') = $1
             ORDER BY created_at DESC`,
            [dateParam],
          );
          return res.json(successEnvelope("GDA.launchpad", "daily-intel", { items: result.rows, date: dateParam }));
        }
      } catch { /* table may not exist */ }
    }

    log.info("launchpad_daily_intel_todo", { message: "news_items table not found — returning empty array" });
    const dateParam = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
    res.json(successEnvelope("GDA.launchpad", "daily-intel", { items: [], date: dateParam }));
  } catch (err) {
    log.error("launchpad_daily_intel_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.launchpad", "daily-intel", {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch daily intel",
        detail: null,
      }),
    );
  }
});

export default router;
