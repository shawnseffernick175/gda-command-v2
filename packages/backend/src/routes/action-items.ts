import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { extractActionFromEmail, type EmailPayload } from "../lib/email-action-extractor";
import { attachSources } from "../lib/source-validator";
import type { SourceRef } from "../lib/source-validator";

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
      errorEnvelope("action-items", "auth", {
        code: "UNAUTHORIZED",
        message: "Missing or invalid x-gda-key",
        detail: null,
      }),
    );
    return;
  }
  next();
}

const TEAM_NAMES = ["team", "all", "everyone", "committee", "group"];

function isTeamName(owner: string): boolean {
  return TEAM_NAMES.includes(owner.toLowerCase().trim());
}

// GET /api/action-items
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("action-items", "list", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { status, owner_email, source, ou_tag, linked_record_type } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`ai.status = $${paramIndex++}`);
      params.push(status);
    } else {
      conditions.push(`ai.status != 'done'`);
    }

    if (owner_email) {
      conditions.push(`ai.owner_email = $${paramIndex++}`);
      params.push(owner_email);
    }

    if (source) {
      conditions.push(`ai.source = $${paramIndex++}`);
      params.push(source);
    }

    if (ou_tag) {
      conditions.push(`ai.ou_tag = $${paramIndex++}`);
      params.push(ou_tag);
    }

    if (linked_record_type) {
      conditions.push(`ai.linked_record_type = $${paramIndex++}`);
      params.push(linked_record_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT ai.*,
              (SELECT json_agg(d.*) FROM action_item_drafts d WHERE d.action_item_id = ai.id) AS drafts
       FROM action_items ai
       ${where}
       ORDER BY ai.due_date ASC NULLS LAST, ai.created_at DESC`,
      params,
    );

    const now = new Date().toISOString();
    const sourcedItems = result.rows.map((row: Record<string, unknown>) => {
      const itemSource = row.source as string | null;
      const sourceId = row.source_id as string | null;
      let citationSources: SourceRef[];

      if (itemSource === "email" && sourceId) {
        citationSources = [{
          kind: "internal",
          title: `Source email ${sourceId}`,
          url: `/inbox/messages/${sourceId}`,
          retrieved_at: now,
        }];
      } else {
        citationSources = [{
          kind: "internal",
          title: `Manual entry`,
          url: `/audit/edits/${row.id}`,
          retrieved_at: now,
        }];
      }

      const fieldMap: Record<string, SourceRef[]> = {
        title: citationSources,
        detail: citationSources,
        owner_email: citationSources,
        due_date: citationSources,
      };

      return attachSources(row, fieldMap, [
        "source", "source_id", "due_inferred_from", "completed_at",
        "linked_record_type", "linked_record_id", "drafts",
        "created_at", "updated_at",
      ]);
    });

    res.json(
      successEnvelope("action-items", "list", {
        items: sourcedItems,
        total: sourcedItems.length,
      }),
    );
  } catch (err) {
    log.error("action_items_list_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("action-items", "list", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/action-items
router.post("/", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("action-items", "create", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const {
      title,
      detail,
      owner_email,
      source,
      source_id,
      due_date,
      due_inferred_from,
      ou_tag,
      linked_record_type,
      linked_record_id,
    } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json(
        errorEnvelope("action-items", "create", {
          code: "VALIDATION_ERROR",
          message: "title is required",
          detail: null,
        }),
      );
      return;
    }

    const ownerValue = owner_email ?? "shawn";
    if (!ownerValue || typeof ownerValue !== "string" || ownerValue.trim().length === 0) {
      res.status(400).json(
        errorEnvelope("action-items", "create", {
          code: "VALIDATION_ERROR",
          message: "Individual owner required (Doctrine: Relentless Execution). owner_email cannot be blank.",
          detail: null,
        }),
      );
      return;
    }

    if (isTeamName(ownerValue)) {
      res.status(400).json(
        errorEnvelope("action-items", "create", {
          code: "VALIDATION_ERROR",
          message: "Individual owner required (Doctrine: Relentless Execution). Team names are not allowed.",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `INSERT INTO action_items (title, detail, owner_email, source, source_id, due_date, due_inferred_from, ou_tag, linked_record_type, linked_record_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title.trim(),
        detail || null,
        ownerValue.trim(),
        source || "manual",
        source_id || null,
        due_date || null,
        due_inferred_from || null,
        ou_tag || "envision",
        linked_record_type || null,
        linked_record_id || null,
      ],
    );

    res.status(201).json(
      successEnvelope("action-items", "create", result.rows[0]),
    );
  } catch (err) {
    log.error("action_items_create_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("action-items", "create", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// PATCH /api/action-items/:id
router.patch("/:id", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("action-items", "update", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id } = req.params;
    const { status, owner_email, due_date, linked_record_type, linked_record_id } = req.body;

    const sets: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status != null) {
      sets.push(`status = $${paramIndex++}`);
      params.push(status);
      if (status === "done") {
        sets.push(`completed_at = NOW()`);
      }
    }

    if (owner_email != null) {
      if (typeof owner_email !== "string" || owner_email.trim().length === 0) {
        res.status(400).json(
          errorEnvelope("action-items", "update", {
            code: "VALIDATION_ERROR",
            message: "Individual owner required. owner_email cannot be blank.",
            detail: null,
          }),
        );
        return;
      }
      if (isTeamName(owner_email)) {
        res.status(400).json(
          errorEnvelope("action-items", "update", {
            code: "VALIDATION_ERROR",
            message: "Individual owner required. Team names are not allowed.",
            detail: null,
          }),
        );
        return;
      }
      sets.push(`owner_email = $${paramIndex++}`);
      params.push(owner_email.trim());
    }

    if (due_date !== undefined) {
      sets.push(`due_date = $${paramIndex++}`);
      params.push(due_date || null);
    }

    if (linked_record_type !== undefined) {
      sets.push(`linked_record_type = $${paramIndex++}`);
      params.push(linked_record_type || null);
    }

    if (linked_record_id !== undefined) {
      sets.push(`linked_record_id = $${paramIndex++}`);
      params.push(linked_record_id || null);
    }

    if (sets.length === 0) {
      res.status(400).json(
        errorEnvelope("action-items", "update", {
          code: "VALIDATION_ERROR",
          message: "No fields to update",
          detail: null,
        }),
      );
      return;
    }

    params.push(id);

    const result = await pool.query(
      `UPDATE action_items SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("action-items", "update", {
          code: "NOT_FOUND",
          message: "Action item not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("action-items", "update", result.rows[0]),
    );
  } catch (err) {
    log.error("action_items_update_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("action-items", "update", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/action-items/ingest-email
// TODO: add IP allowlist in production
router.post("/ingest-email", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("action-items", "ingest-email", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const payload: EmailPayload = req.body;

    if (!payload.from || !payload.to || !payload.body_text) {
      res.status(400).json(
        errorEnvelope("action-items", "ingest-email", {
          code: "VALIDATION_ERROR",
          message: "Email payload requires from, to, and body_text fields",
          detail: null,
        }),
      );
      return;
    }

    const extracted = await extractActionFromEmail(payload);

    const itemResult = await pool.query(
      `INSERT INTO action_items (title, detail, owner_email, source, source_id, due_date, due_inferred_from, ou_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        extracted.title,
        extracted.detail,
        extracted.owner_email,
        extracted.source,
        extracted.source_id || null,
        extracted.due_date,
        extracted.due_inferred_from,
        extracted.ou_tag,
      ],
    );

    const item = itemResult.rows[0];

    const draftResult = await pool.query(
      `INSERT INTO action_item_drafts (action_item_id, kind, draft_text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [item.id, extracted.draft.kind, extracted.draft.draft_text],
    );

    res.status(201).json(
      successEnvelope("action-items", "ingest-email", {
        action_item: item,
        draft: draftResult.rows[0],
      }),
    );
  } catch (err) {
    log.error("action_items_ingest_email_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("action-items", "ingest-email", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/action-items/:id/approve-draft/:draft_id
router.post("/:id/approve-draft/:draft_id", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("action-items", "approve-draft", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { id, draft_id } = req.params;

    const draftResult = await pool.query(
      `UPDATE action_item_drafts
       SET status = 'approved'
       WHERE id = $1 AND action_item_id = $2
       RETURNING *`,
      [draft_id, id],
    );

    if (draftResult.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("action-items", "approve-draft", {
          code: "NOT_FOUND",
          message: "Draft not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("action-items", "approve-draft", draftResult.rows[0]),
    );
  } catch (err) {
    log.error("action_items_approve_draft_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("action-items", "approve-draft", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

export default router;
