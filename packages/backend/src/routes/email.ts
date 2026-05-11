// ---------------------------------------------------------------------------
// Email notification routes
// ---------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { getPool } from "../lib/db";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getEmailStatus, testSmtpConnection, sendEmail, isEmailConfigured } from "../lib/email";
import { log } from "../lib/logger";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/email/status — email system status (admin only)
// ---------------------------------------------------------------------------
router.get("/status", requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const status = await getEmailStatus();
    res.json(successEnvelope("gda-email", "status", status));
  } catch (e) {
    log.error("email_status_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-email", "status", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/email/test — test SMTP connection (admin only)
// ---------------------------------------------------------------------------
router.post("/test", requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const result = await testSmtpConnection();
    if (result.success) {
      res.json(successEnvelope("gda-email", "test", { connected: true }));
    } else {
      res.json(successEnvelope("gda-email", "test", { connected: false, error: result.error }));
    }
  } catch (e) {
    log.error("email_test_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-email", "test", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/email/send-test — send a test email (admin only)
// ---------------------------------------------------------------------------
router.post("/send-test", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { to } = req.body as { to?: string };
    if (!to) {
      res.status(400).json(
        errorEnvelope("gda-email", "send-test", {
          code: "BAD_REQUEST",
          message: "Recipient email (to) is required",
          detail: null,
        }),
      );
      return;
    }

    const result = await sendEmail(to, "generic", {
      title: "Test Email from GDA Command",
      message: "If you received this email, your SMTP configuration is working correctly!",
    });

    if (result.success) {
      res.json(successEnvelope("gda-email", "send-test", { sent: true, to }));
    } else {
      res.json(successEnvelope("gda-email", "send-test", { sent: false, error: result.error }));
    }
  } catch (e) {
    log.error("email_send_test_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-email", "send-test", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/email/preferences — get current user's notification preferences
// ---------------------------------------------------------------------------
router.get("/preferences", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json(
        errorEnvelope("gda-email", "preferences", {
          code: "DB_UNAVAILABLE",
          message: "Database not available",
          detail: null,
        }),
      );
      return;
    }

    const userId = (req as unknown as Record<string, unknown>).userId as string | undefined;
    if (!userId) {
      res.status(401).json(
        errorEnvelope("gda-email", "preferences", {
          code: "UNAUTHORIZED",
          message: "Not authenticated",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `SELECT email_notifications_enabled, email_digest_enabled, email_digest_frequency, notification_categories
       FROM users WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("gda-email", "preferences", {
          code: "NOT_FOUND",
          message: "User not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("gda-email", "preferences", {
        ...result.rows[0],
        email_configured: isEmailConfigured(),
      }),
    );
  } catch (e) {
    log.error("email_preferences_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-email", "preferences", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/email/preferences — update current user's notification preferences
// ---------------------------------------------------------------------------
router.put("/preferences", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json(
        errorEnvelope("gda-email", "preferences", {
          code: "DB_UNAVAILABLE",
          message: "Database not available",
          detail: null,
        }),
      );
      return;
    }

    const userId = (req as unknown as Record<string, unknown>).userId as string | undefined;
    if (!userId) {
      res.status(401).json(
        errorEnvelope("gda-email", "preferences", {
          code: "UNAUTHORIZED",
          message: "Not authenticated",
          detail: null,
        }),
      );
      return;
    }

    const {
      email_notifications_enabled,
      email_digest_enabled,
      email_digest_frequency,
      notification_categories,
    } = req.body as {
      email_notifications_enabled?: boolean;
      email_digest_enabled?: boolean;
      email_digest_frequency?: string;
      notification_categories?: string[];
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (email_notifications_enabled !== undefined) {
      updates.push(`email_notifications_enabled = $${idx++}`);
      values.push(email_notifications_enabled);
    }
    if (email_digest_enabled !== undefined) {
      updates.push(`email_digest_enabled = $${idx++}`);
      values.push(email_digest_enabled);
    }
    if (email_digest_frequency !== undefined) {
      if (!["daily", "weekly"].includes(email_digest_frequency)) {
        res.status(400).json(
          errorEnvelope("gda-email", "preferences", {
            code: "BAD_REQUEST",
            message: "digest_frequency must be 'daily' or 'weekly'",
            detail: null,
          }),
        );
        return;
      }
      updates.push(`email_digest_frequency = $${idx++}`);
      values.push(email_digest_frequency);
    }
    if (notification_categories !== undefined) {
      updates.push(`notification_categories = $${idx++}::jsonb`);
      values.push(JSON.stringify(notification_categories));
    }

    if (updates.length === 0) {
      res.status(400).json(
        errorEnvelope("gda-email", "preferences", {
          code: "BAD_REQUEST",
          message: "No preference fields provided",
          detail: null,
        }),
      );
      return;
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}`,
      values,
    );

    // Return updated preferences
    const result = await pool.query(
      `SELECT email_notifications_enabled, email_digest_enabled, email_digest_frequency, notification_categories
       FROM users WHERE id = $1`,
      [userId],
    );

    res.json(successEnvelope("gda-email", "preferences", result.rows[0]));
  } catch (e) {
    log.error("email_preferences_update_error", { error: (e as Error).message });
    res.status(500).json(
      errorEnvelope("gda-email", "preferences", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
