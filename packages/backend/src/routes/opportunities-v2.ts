import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { evaluateTeamingFlags } from "../lib/teaming-engine";
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
      errorEnvelope("opportunities-v2", "auth", {
        code: "UNAUTHORIZED",
        message: "Missing or invalid x-gda-key",
        detail: null,
      }),
    );
    return;
  }
  next();
}

// GET /api/v2/opportunities
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("opportunities-v2", "list", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const {
      naics,
      agency,
      set_aside,
      min_value,
      max_value,
      due_before,
      due_after,
      grade,
      qualified,
      ou_tag,
      page,
      per_page,
    } = req.query;

    const ouTag = (ou_tag as string) || "envision";
    conditions.push(`ou_tag = $${paramIndex++}`);
    params.push(ouTag);

    if (naics) {
      conditions.push(`naics ILIKE $${paramIndex++}`);
      params.push(`%${naics}%`);
    }
    if (agency) {
      conditions.push(`agency ILIKE $${paramIndex++}`);
      params.push(`%${agency}%`);
    }
    if (set_aside) {
      conditions.push(`set_aside ILIKE $${paramIndex++}`);
      params.push(`%${set_aside}%`);
    }
    if (min_value) {
      conditions.push(`value_max >= $${paramIndex++}`);
      params.push(Number(min_value));
    }
    if (max_value) {
      conditions.push(`value_min <= $${paramIndex++}`);
      params.push(Number(max_value));
    }
    if (due_before) {
      conditions.push(`response_due_at <= $${paramIndex++}`);
      params.push(due_before);
    }
    if (due_after) {
      conditions.push(`response_due_at >= $${paramIndex++}`);
      params.push(due_after);
    }
    if (grade) {
      conditions.push(`grade = $${paramIndex++}`);
      params.push(grade);
    }
    if (qualified === "true") {
      conditions.push("qualified_at IS NOT NULL");
    } else if (qualified === "false") {
      conditions.push("qualified_at IS NULL");
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Number(per_page) || 50, 200);
    const offset = ((Number(page) || 1) - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM opportunities ${where}`,
      params,
    );
    const total = Number(countResult.rows[0].count);

    const dataResult = await pool.query(
      `SELECT o.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', tf.id, 'reason', tf.reason, 'suggested_partner', tf.suggested_partner, 'detail', tf.detail))
                 FROM teaming_flags tf WHERE tf.opportunity_id = o.id),
                '[]'
              ) AS teaming_flags
       FROM opportunities o
       ${where}
       ORDER BY response_due_at ASC NULLS LAST
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    res.json(
      successEnvelope("opportunities-v2", "list", {
        opportunities: dataResult.rows,
        total,
        page: Number(page) || 1,
        per_page: limit,
      }),
    );
  } catch (err) {
    log.error("opportunities_v2_list_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("opportunities-v2", "list", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/v2/opportunities
router.post("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("opportunities-v2", "create", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const {
      source,
      sam_notice_id,
      naics,
      agency,
      sub_agency,
      title,
      description,
      set_aside,
      response_due_at,
      posted_at,
      value_min,
      value_max,
      is_partner_teaming_required,
      teaming_partner,
    } = req.body;

    if (!title || !source) {
      res.status(400).json(
        errorEnvelope("opportunities-v2", "create", {
          code: "VALIDATION_ERROR",
          message: "title and source are required",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `INSERT INTO opportunities
        (ou_tag, source, sam_notice_id, naics, agency, sub_agency, title, description,
         set_aside, response_due_at, posted_at, value_min, value_max,
         is_partner_teaming_required, teaming_partner)
       VALUES ('envision', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        source,
        sam_notice_id || null,
        naics || null,
        agency || null,
        sub_agency || null,
        title,
        description || null,
        set_aside || null,
        response_due_at || null,
        posted_at || null,
        value_min ?? null,
        value_max ?? null,
        is_partner_teaming_required ?? false,
        teaming_partner || null,
      ],
    );

    const created = result.rows[0];

    // Fire-and-forget teaming flag evaluation
    evaluateTeamingFlags(created.id, pool).catch((err) => {
      log.error("teaming_flags_async_error", {
        error: String((err as Error).message),
      });
    });

    res.status(201).json(
      successEnvelope("opportunities-v2", "create", created),
    );
  } catch (err) {
    log.error("opportunities_v2_create_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("opportunities-v2", "create", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/v2/opportunities/:id/qualify
router.post("/:id/qualify", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("opportunities-v2", "qualify", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { qualified_by } = req.body;

    const result = await pool.query(
      `UPDATE opportunities
       SET qualified_at = NOW(), qualified_by = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [qualified_by || "system", id],
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("opportunities-v2", "qualify", {
          code: "NOT_FOUND",
          message: "Opportunity not found",
          detail: null,
        }),
      );
      return;
    }

    const opp = result.rows[0];

    // Synchronous teaming flag evaluation
    const flags = await evaluateTeamingFlags(opp.id, pool);

    res.json(
      successEnvelope("opportunities-v2", "qualify", {
        opportunity: opp,
        teaming_flags: flags,
      }),
    );
  } catch (err) {
    log.error("opportunities_v2_qualify_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("opportunities-v2", "qualify", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/v2/opportunities/:id/grade
router.post("/:id/grade", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("opportunities-v2", "grade", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { grade, grade_evidence } = req.body;

    if (!grade || !["A", "B", "C"].includes(grade)) {
      res.status(400).json(
        errorEnvelope("opportunities-v2", "grade", {
          code: "VALIDATION_ERROR",
          message: "grade must be A, B, or C",
          detail: null,
        }),
      );
      return;
    }

    if (!grade_evidence || typeof grade_evidence !== "string" || grade_evidence.trim().length === 0) {
      res.status(400).json(
        errorEnvelope("opportunities-v2", "grade", {
          code: "VALIDATION_ERROR",
          message: "grade_evidence is required",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `UPDATE opportunities
       SET grade = $1, grade_evidence = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [grade, grade_evidence.trim(), id],
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("opportunities-v2", "grade", {
          code: "NOT_FOUND",
          message: "Opportunity not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("opportunities-v2", "grade", result.rows[0]),
    );
  } catch (err) {
    log.error("opportunities_v2_grade_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("opportunities-v2", "grade", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

export default router;
