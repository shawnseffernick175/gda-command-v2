import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";

const router = Router();

function requireKey(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const gdaKey = process.env.GDA_WEBHOOK_KEY ?? "";
  const key = req.headers["x-gda-key"] as string | undefined;
  if (!gdaKey || key !== gdaKey) {
    res.status(401).json(
      errorEnvelope("compliance-items", "auth", {
        code: "UNAUTHORIZED",
        message: "Missing or invalid x-gda-key",
        detail: null,
      }),
    );
    return;
  }
  next();
}

const VALID_STATUSES = ["open", "in_progress", "complete", "waived"];

// PATCH /api/compliance-items/:id
router.patch("/:id", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("compliance-items", "update", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { status, owner_team, evidence_link } = req.body;

    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status != null) {
      if (!VALID_STATUSES.includes(status)) {
        res.status(400).json(
          errorEnvelope("compliance-items", "update", {
            code: "VALIDATION_ERROR",
            message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
            detail: null,
          }),
        );
        return;
      }
      sets.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (owner_team !== undefined) {
      sets.push(`owner_team = $${paramIndex++}`);
      params.push(owner_team || null);
    }

    if (evidence_link !== undefined) {
      sets.push(`evidence_link = $${paramIndex++}`);
      params.push(evidence_link || null);
    }

    params.push(id);

    const result = await pool.query(
      `UPDATE compliance_items SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("compliance-items", "update", {
          code: "NOT_FOUND",
          message: "Compliance item not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("compliance-items", "update", result.rows[0]),
    );
  } catch (err) {
    log.error("compliance_items_update_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("compliance-items", "update", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

export default router;
