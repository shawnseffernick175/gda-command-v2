import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { shredRfp } from "../lib/rfp-shredder";
import { checkPricingGuardrails } from "../lib/pricing-guard";
import { generateTeamingWorksheet, type OuTag } from "../lib/teaming-worksheet";

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
      errorEnvelope("captures", "auth", {
        code: "UNAUTHORIZED",
        message: "Missing or invalid x-gda-key",
        detail: null,
      }),
    );
    return;
  }
  next();
}

const rfpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

const VALID_PARTNER_TAGS = ["riverstone", "pd_systems"];

// GET /api/captures
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("captures", "list", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { ou_tag, stage, behind } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const ouTag = (ou_tag as string) || "envision";
    conditions.push(`c.ou_tag = $${paramIndex++}`);
    params.push(ouTag);

    if (stage) {
      conditions.push(`c.color_review_stage = $${paramIndex++}`);
      params.push(stage);
    }
    if (behind === "1") {
      conditions.push(`c.color_review_stage != 'submitted'`);
      conditions.push(`o.response_due_at < NOW()`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT c.*,
              pi.capture_owner AS pipeline_capture_owner,
              o.title AS opportunity_title,
              o.agency AS opportunity_agency
       FROM captures c
       JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
       JOIN opportunities o ON o.id = pi.opportunity_id
       ${where}
       ORDER BY c.updated_at DESC`,
      params,
    );

    res.json(
      successEnvelope("captures", "list", {
        items: result.rows,
        total: result.rows.length,
      }),
    );
  } catch (err) {
    log.error("captures_list_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("captures", "list", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/captures
router.post("/", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("captures", "create", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { pipeline_item_id, ou_tag } = req.body;

    if (!pipeline_item_id) {
      res.status(400).json(
        errorEnvelope("captures", "create", {
          code: "VALIDATION_ERROR",
          message: "pipeline_item_id is required",
          detail: null,
        }),
      );
      return;
    }

    const piResult = await pool.query(
      "SELECT id FROM pipeline_items WHERE id = $1",
      [pipeline_item_id],
    );
    if (piResult.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("captures", "create", {
          code: "NOT_FOUND",
          message: "Pipeline item not found",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `INSERT INTO captures (pipeline_item_id, ou_tag)
       VALUES ($1, $2)
       RETURNING *`,
      [pipeline_item_id, ou_tag || "envision"],
    );

    res.status(201).json(
      successEnvelope("captures", "create", result.rows[0]),
    );
  } catch (err) {
    log.error("captures_create_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("captures", "create", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// PATCH /api/captures/:id
router.patch("/:id", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("captures", "update", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { color_review_notes, pricing_assumptions, teaming_worksheet } = req.body;

    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (color_review_notes != null) {
      sets.push(`color_review_notes = $${paramIndex++}`);
      params.push(color_review_notes);
    }

    if (pricing_assumptions != null) {
      sets.push(`pricing_assumptions = $${paramIndex++}`);
      params.push(JSON.stringify(pricing_assumptions));
    }

    if (teaming_worksheet != null) {
      sets.push(`teaming_worksheet = $${paramIndex++}`);
      params.push(JSON.stringify(teaming_worksheet));
    }

    params.push(id);

    const result = await pool.query(
      `UPDATE captures SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("captures", "update", {
          code: "NOT_FOUND",
          message: "Capture not found",
          detail: null,
        }),
      );
      return;
    }

    const capture = result.rows[0];
    let pricingGuardrail = null;

    if (pricing_assumptions?.margin_pct != null) {
      pricingGuardrail = checkPricingGuardrails(pricing_assumptions);
    }

    res.json(
      successEnvelope("captures", "update", {
        ...capture,
        pricing_guardrail: pricingGuardrail,
      }),
    );
  } catch (err) {
    log.error("captures_update_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("captures", "update", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/captures/:id/shred-rfp
router.post("/:id/shred-rfp", requireKey, rfpUpload.single("file"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("captures", "shred-rfp", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;

    if (!req.file) {
      res.status(400).json(
        errorEnvelope("captures", "shred-rfp", {
          code: "VALIDATION_ERROR",
          message: "File upload required. Only PDF and DOCX formats are accepted.",
          detail: null,
        }),
      );
      return;
    }

    const captureResult = await pool.query(
      "SELECT id FROM captures WHERE id = $1",
      [id],
    );
    if (captureResult.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("captures", "shred-rfp", {
          code: "NOT_FOUND",
          message: "Capture not found",
          detail: null,
        }),
      );
      return;
    }

    const rfpDir = path.join(process.cwd(), "uploads", "rfp");
    if (!fs.existsSync(rfpDir)) {
      fs.mkdirSync(rfpDir, { recursive: true });
    }
    const ext = req.file.mimetype === "application/pdf" ? ".pdf" : ".docx";
    const fileName = `capture_${id}_${Date.now()}${ext}`;
    const filePath = path.join(rfpDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    await pool.query(
      `UPDATE captures SET rfp_uploaded_at = NOW(), rfp_storage_url = $1, updated_at = NOW() WHERE id = $2`,
      [filePath, id],
    );

    const mimeType = req.file.mimetype as
      | "application/pdf"
      | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const items = await shredRfp(req.file.buffer, mimeType, Number(id), pool);

    res.json(
      successEnvelope("captures", "shred-rfp", {
        compliance_items: items,
        total: items.length,
      }),
    );
  } catch (err) {
    log.error("captures_shred_rfp_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("captures", "shred-rfp", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/captures/:id/advance-stage
router.post("/:id/advance-stage", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("captures", "advance-stage", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { note } = req.body;

    const captureResult = await pool.query(
      "SELECT id, color_review_stage, color_review_notes FROM captures WHERE id = $1",
      [id],
    );
    if (captureResult.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("captures", "advance-stage", {
          code: "NOT_FOUND",
          message: "Capture not found",
          detail: null,
        }),
      );
      return;
    }

    const capture = captureResult.rows[0];
    const stageOrder: string[] = ["pink", "red", "gold", "submitted"];
    const currentIdx = stageOrder.indexOf(capture.color_review_stage);

    if (currentIdx === stageOrder.length - 1) {
      res.status(400).json(
        errorEnvelope("captures", "advance-stage", {
          code: "STAGE_FINAL",
          message: "Capture is already in submitted stage and cannot be advanced further",
          detail: null,
        }),
      );
      return;
    }

    const nextStage = stageOrder[currentIdx + 1];
    const notes = [...(capture.color_review_notes || [])];
    if (note) {
      notes.push(`[${capture.color_review_stage} → ${nextStage}] ${note}`);
    }

    const result = await pool.query(
      `UPDATE captures
       SET color_review_stage = $1, color_review_notes = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [nextStage, notes, id],
    );

    res.json(
      successEnvelope("captures", "advance-stage", result.rows[0]),
    );
  } catch (err) {
    log.error("captures_advance_stage_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("captures", "advance-stage", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/captures/:id/generate-teaming-worksheet
router.post("/:id/generate-teaming-worksheet", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("captures", "generate-teaming-worksheet", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { partner_ou_tags } = req.body;

    if (!Array.isArray(partner_ou_tags) || partner_ou_tags.length === 0) {
      res.status(400).json(
        errorEnvelope("captures", "generate-teaming-worksheet", {
          code: "VALIDATION_ERROR",
          message: "partner_ou_tags array is required",
          detail: null,
        }),
      );
      return;
    }

    for (const tag of partner_ou_tags) {
      if (!VALID_PARTNER_TAGS.includes(tag)) {
        res.status(400).json(
          errorEnvelope("captures", "generate-teaming-worksheet", {
            code: "VALIDATION_ERROR",
            message: `${tag} is not a known partner. Valid partners: ${VALID_PARTNER_TAGS.join(", ")}`,
            detail: null,
          }),
        );
        return;
      }
    }

    const captureResult = await pool.query(
      "SELECT id FROM captures WHERE id = $1",
      [id],
    );
    if (captureResult.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("captures", "generate-teaming-worksheet", {
          code: "NOT_FOUND",
          message: "Capture not found",
          detail: null,
        }),
      );
      return;
    }

    const worksheets = await generateTeamingWorksheet(
      Number(id),
      partner_ou_tags as OuTag[],
      pool,
    );

    res.json(
      successEnvelope("captures", "generate-teaming-worksheet", {
        worksheets,
      }),
    );
  } catch (err) {
    log.error("captures_teaming_worksheet_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("captures", "generate-teaming-worksheet", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

export default router;
