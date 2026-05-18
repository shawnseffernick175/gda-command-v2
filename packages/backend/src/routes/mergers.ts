import { Router } from "express";
import type { MergerAcquisition, MergerOppImpact, DealType, DealStatus, OurImpact, OppImpactType } from "@gda/shared";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import { recordVersion } from "../lib/versioning";
import crypto from "crypto";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/mergers — list all M&A events with summary stats
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const pool = getPool();

    if (pool) {
      try {
        const { status, impact } = req.query;
        let query = `SELECT * FROM mergers_acquisitions WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (status && typeof status === "string") {
          query += ` AND status = $${idx++}`;
          params.push(status);
        }
        if (impact && typeof impact === "string") {
          query += ` AND our_impact = $${idx++}`;
          params.push(impact);
        }

        query += ` ORDER BY announced_date DESC NULLS LAST`;
        const result = await pool.query(query, params);

        const impactCounts = await pool.query(`
          SELECT our_impact, COUNT(*)::int as count
          FROM mergers_acquisitions
          GROUP BY our_impact
        `);

        const mergers: MergerAcquisition[] = result.rows.map((r) => ({
          ...r,
          deal_value: r.deal_value ? Number(r.deal_value) : null,
          score_adjustment: Number(r.score_adjustment),
          announced_date: r.announced_date?.toISOString?.()?.split("T")[0] ?? r.announced_date,
          closed_date: r.closed_date?.toISOString?.()?.split("T")[0] ?? r.closed_date,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
        }));

        return res.json(
          successEnvelope("mergers", "list", {
            mergers,
            total: mergers.length,
            impact_summary: Object.fromEntries(
              impactCounts.rows.map((r) => [r.our_impact, r.count])
            ),
          })
        );
      } catch {
        // table may not exist — fall through
      }
    }

    res.json(
      successEnvelope("mergers", "list", {
        mergers: [],
        total: 0,
        impact_summary: {},
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("mergers", "list", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/mergers/:id — get a single M&A event with linked opportunity impacts
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("mergers", "get", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const { rows } = await pool.query(
      "SELECT * FROM mergers_acquisitions WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("mergers", "get", {
          code: "NOT_FOUND",
          message: "M&A event not found",
          detail: null,
        })
      );
    }

    const impacts = await pool.query(
      `SELECT moi.*, o.title as opp_title, o.agency as opp_agency, o.value_estimated as opp_value
       FROM merger_opp_impacts moi
       LEFT JOIN opportunities o ON o.id = moi.opportunity_id
       WHERE moi.merger_id = $1
       ORDER BY moi.created_at DESC`,
      [req.params.id]
    );

    const merger = rows[0];
    res.json(
      successEnvelope("mergers", "get", {
        merger: {
          ...merger,
          deal_value: merger.deal_value ? Number(merger.deal_value) : null,
          score_adjustment: Number(merger.score_adjustment),
          announced_date: merger.announced_date?.toISOString?.()?.split("T")[0] ?? merger.announced_date,
          closed_date: merger.closed_date?.toISOString?.()?.split("T")[0] ?? merger.closed_date,
          created_at: merger.created_at instanceof Date ? merger.created_at.toISOString() : merger.created_at,
          updated_at: merger.updated_at instanceof Date ? merger.updated_at.toISOString() : merger.updated_at,
        },
        impacts: impacts.rows.map((r) => ({
          ...r,
          score_delta: Number(r.score_delta),
          opp_value: r.opp_value ? Number(r.opp_value) : null,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        })),
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("mergers", "get", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/mergers — create a new M&A event (admin only)
// ---------------------------------------------------------------------------
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("mergers", "create", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const {
      acquirer_name,
      target_name,
      deal_type = "acquisition",
      status = "announced",
      announced_date,
      closed_date,
      deal_value,
      rationale,
      impact_summary,
      affected_naics = [],
      affected_agencies = [],
      our_impact = "neutral",
      score_adjustment = 0,
      source_url,
      notes,
    } = req.body as {
      acquirer_name: string;
      target_name: string;
      deal_type?: DealType;
      status?: DealStatus;
      announced_date?: string;
      closed_date?: string;
      deal_value?: number;
      rationale?: string;
      impact_summary?: string;
      affected_naics?: string[];
      affected_agencies?: string[];
      our_impact?: OurImpact;
      score_adjustment?: number;
      source_url?: string;
      notes?: string;
    };

    if (!acquirer_name || !target_name) {
      return res.status(400).json(
        errorEnvelope("mergers", "create", {
          code: "VALIDATION_ERROR",
          message: "acquirer_name and target_name are required",
          detail: null,
        })
      );
    }

    const id = `ma-${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO mergers_acquisitions
       (id, acquirer_name, target_name, deal_type, status, announced_date, closed_date,
        deal_value, rationale, impact_summary, affected_naics, affected_agencies,
        our_impact, score_adjustment, source_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, acquirer_name, target_name, deal_type, status,
       announced_date ?? null, closed_date ?? null, deal_value ?? null,
       rationale ?? null, impact_summary ?? null,
       affected_naics, affected_agencies,
       our_impact, score_adjustment, source_url ?? null, notes ?? null]
    );

    const { rows } = await pool.query("SELECT * FROM mergers_acquisitions WHERE id = $1", [id]);
    const userId = req.user?.userId ?? "unknown";
    await recordVersion("mergers_acquisitions", id, rows[0], userId, "create");

    res.status(201).json(successEnvelope("mergers", "create", rows[0]));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("mergers", "create", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/mergers/:id — update an M&A event (admin only)
// ---------------------------------------------------------------------------
router.put("/:id", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("mergers", "update", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const allowedFields = [
      "acquirer_name", "target_name", "deal_type", "status",
      "announced_date", "closed_date", "deal_value", "rationale",
      "impact_summary", "affected_naics", "affected_agencies",
      "our_impact", "score_adjustment", "source_url", "notes",
    ];

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json(
        errorEnvelope("mergers", "update", {
          code: "VALIDATION_ERROR",
          message: "No fields to update",
          detail: null,
        })
      );
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE mergers_acquisitions SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("mergers", "update", {
          code: "NOT_FOUND",
          message: "M&A event not found",
          detail: null,
        })
      );
    }

    const userId = req.user?.userId ?? "unknown";
    await recordVersion("mergers_acquisitions", req.params.id, result.rows[0], userId, "update");

    res.json(successEnvelope("mergers", "update", result.rows[0]));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("mergers", "update", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/mergers/:id/impacts — link an opportunity to an M&A event (admin)
// ---------------------------------------------------------------------------
router.post("/:id/impacts", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("mergers", "add-impact", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const { opportunity_id, impact_type = "neutral", description, score_delta = 0 } = req.body as {
      opportunity_id: string;
      impact_type?: OppImpactType;
      description?: string;
      score_delta?: number;
    };

    if (!opportunity_id) {
      return res.status(400).json(
        errorEnvelope("mergers", "add-impact", {
          code: "VALIDATION_ERROR",
          message: "opportunity_id is required",
          detail: null,
        })
      );
    }

    const id = `moi-${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO merger_opp_impacts (id, merger_id, opportunity_id, impact_type, description, score_delta)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (merger_id, opportunity_id) DO UPDATE SET
         impact_type = EXCLUDED.impact_type,
         description = EXCLUDED.description,
         score_delta = EXCLUDED.score_delta`,
      [id, req.params.id, opportunity_id, impact_type, description ?? null, score_delta]
    );

    const { rows } = await pool.query(
      `SELECT moi.*, o.title as opp_title, o.agency as opp_agency, o.value_estimated as opp_value
       FROM merger_opp_impacts moi
       LEFT JOIN opportunities o ON o.id = moi.opportunity_id
       WHERE moi.merger_id = $1 AND moi.opportunity_id = $2`,
      [req.params.id, opportunity_id]
    );

    res.status(201).json(successEnvelope("mergers", "add-impact", rows[0]));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("mergers", "add-impact", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/mergers/impacts/by-opportunity/:oppId — impacts for an opportunity
// ---------------------------------------------------------------------------
router.get("/impacts/by-opportunity/:oppId", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json(
        successEnvelope("mergers", "opp-impacts", { impacts: [], total_score_delta: 0 })
      );
    }

    try {
      const result = await pool.query(
        `SELECT moi.*, ma.acquirer_name, ma.target_name, ma.deal_type, ma.status as deal_status
         FROM merger_opp_impacts moi
         JOIN mergers_acquisitions ma ON ma.id = moi.merger_id
         WHERE moi.opportunity_id = $1
         ORDER BY moi.created_at DESC`,
        [req.params.oppId]
      );

      const totalDelta = result.rows.reduce((sum, r) => sum + Number(r.score_delta), 0);

      res.json(
        successEnvelope("mergers", "opp-impacts", {
          impacts: result.rows,
          total_score_delta: totalDelta,
        })
      );
    } catch {
      res.json(
        successEnvelope("mergers", "opp-impacts", { impacts: [], total_score_delta: 0 })
      );
    }
  } catch (err) {
    res.status(500).json(
      errorEnvelope("mergers", "opp-impacts", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

export default router;
