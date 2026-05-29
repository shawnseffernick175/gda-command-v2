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
      errorEnvelope("pipeline-v2", "auth", {
        code: "UNAUTHORIZED",
        message: "Missing or invalid x-gda-key",
        detail: null,
      }),
    );
    return;
  }
  next();
}

// GET /api/v2/pipeline
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("pipeline-v2", "list", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { capture_owner, ou_tag } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const ouTag = (ou_tag as string) || "envision";
    conditions.push(`pi.ou_tag = $${paramIndex++}`);
    params.push(ouTag);

    if (capture_owner) {
      conditions.push(`pi.capture_owner ILIKE $${paramIndex++}`);
      params.push(`%${capture_owner}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT pi.*,
              o.title AS opportunity_title,
              o.agency AS opportunity_agency,
              o.naics AS opportunity_naics,
              o.set_aside AS opportunity_set_aside,
              o.response_due_at AS opportunity_due_at,
              o.value_min AS opportunity_value_min,
              o.value_max AS opportunity_value_max,
              o.grade AS opportunity_grade
       FROM pipeline_items pi
       JOIN opportunities o ON o.id = pi.opportunity_id
       ${where}
       ORDER BY pi.created_at DESC`,
      params,
    );

    res.json(
      successEnvelope("pipeline-v2", "list", {
        items: result.rows,
        total: result.rows.length,
      }),
    );
  } catch (err) {
    log.error("pipeline_v2_list_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("pipeline-v2", "list", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/v2/pipeline
router.post("/", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("pipeline-v2", "create", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const {
      opportunity_id,
      capture_owner,
      milestones,
      win_prob_pct,
      win_prob_evidence,
      teaming_partners,
    } = req.body;

    if (!opportunity_id) {
      res.status(400).json(
        errorEnvelope("pipeline-v2", "create", {
          code: "VALIDATION_ERROR",
          message: "opportunity_id is required",
          detail: null,
        }),
      );
      return;
    }

    if (!capture_owner) {
      res.status(400).json(
        errorEnvelope("pipeline-v2", "create", {
          code: "VALIDATION_ERROR",
          message: "capture_owner is required",
          detail: null,
        }),
      );
      return;
    }

    if (!win_prob_evidence || typeof win_prob_evidence !== "string" || win_prob_evidence.trim().length === 0) {
      res.status(400).json(
        errorEnvelope("pipeline-v2", "create", {
          code: "VALIDATION_ERROR",
          message: "win_prob_evidence is required",
          detail: null,
        }),
      );
      return;
    }

    // Check opp is qualified
    const oppResult = await pool.query(
      "SELECT id, qualified_at, ou_tag, is_partner_teaming_required FROM opportunities WHERE id = $1",
      [opportunity_id],
    );
    if (oppResult.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("pipeline-v2", "create", {
          code: "NOT_FOUND",
          message: "Opportunity not found",
          detail: null,
        }),
      );
      return;
    }

    const opp = oppResult.rows[0];
    if (!opp.qualified_at) {
      res.status(422).json(
        errorEnvelope("pipeline-v2", "create", {
          code: "NOT_QUALIFIED",
          message:
            "Opportunity must be qualified before adding to pipeline",
          detail: null,
        }),
      );
      return;
    }

    // Auto-set teaming_partners if is_partner_teaming_required
    let partners = teaming_partners ?? [];
    if (opp.is_partner_teaming_required && partners.length === 0) {
      partners = ["teaming"];
    }

    const result = await pool.query(
      `INSERT INTO pipeline_items
        (ou_tag, opportunity_id, capture_owner, milestones, win_prob_pct, win_prob_evidence, teaming_partners)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        opp.ou_tag,
        opportunity_id,
        capture_owner,
        JSON.stringify(milestones ?? []),
        win_prob_pct ?? null,
        win_prob_evidence.trim(),
        partners,
      ],
    );

    res.status(201).json(
      successEnvelope("pipeline-v2", "create", result.rows[0]),
    );
  } catch (err) {
    log.error("pipeline_v2_create_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("pipeline-v2", "create", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// PATCH /api/v2/pipeline/:id
router.patch("/:id", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("pipeline-v2", "update", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const {
      capture_owner,
      milestones,
      win_prob_pct,
      win_prob_evidence,
      teaming_partners,
    } = req.body;

    // If win_prob_pct is being set, require evidence
    if (
      win_prob_pct !== undefined &&
      win_prob_pct !== null &&
      (!win_prob_evidence ||
        typeof win_prob_evidence !== "string" ||
        win_prob_evidence.trim().length === 0)
    ) {
      res.status(400).json(
        errorEnvelope("pipeline-v2", "update", {
          code: "VALIDATION_ERROR",
          message:
            "win_prob_evidence is required when setting win_prob_pct",
          detail: null,
        }),
      );
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (capture_owner !== undefined) {
      sets.push(`capture_owner = $${paramIndex++}`);
      params.push(capture_owner);
    }
    if (milestones !== undefined) {
      sets.push(`milestones = $${paramIndex++}`);
      params.push(JSON.stringify(milestones));
    }
    if (win_prob_pct !== undefined) {
      sets.push(`win_prob_pct = $${paramIndex++}`);
      params.push(win_prob_pct);
    }
    if (win_prob_evidence !== undefined) {
      sets.push(`win_prob_evidence = $${paramIndex++}`);
      params.push(win_prob_evidence.trim());
    }
    if (teaming_partners !== undefined) {
      sets.push(`teaming_partners = $${paramIndex++}`);
      params.push(teaming_partners);
    }

    if (sets.length === 0) {
      res.status(400).json(
        errorEnvelope("pipeline-v2", "update", {
          code: "VALIDATION_ERROR",
          message: "No fields to update",
          detail: null,
        }),
      );
      return;
    }

    sets.push("updated_at = NOW()");
    params.push(id);

    const result = await pool.query(
      `UPDATE pipeline_items SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("pipeline-v2", "update", {
          code: "NOT_FOUND",
          message: "Pipeline item not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("pipeline-v2", "update", result.rows[0]),
    );
  } catch (err) {
    log.error("pipeline_v2_update_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("pipeline-v2", "update", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// DELETE /api/v2/pipeline/:id
router.delete("/:id", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("pipeline-v2", "delete", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM pipeline_items WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("pipeline-v2", "delete", {
          code: "NOT_FOUND",
          message: "Pipeline item not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("pipeline-v2", "delete", { deleted: true }),
    );
  } catch (err) {
    log.error("pipeline_v2_delete_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("pipeline-v2", "delete", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

export default router;
