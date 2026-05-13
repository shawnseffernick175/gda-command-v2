import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
const router = Router();

// ---------------------------------------------------------------------------
// Risk Register — if-this-then-that portfolio risk tracking
// ---------------------------------------------------------------------------

// GET /api/risk-register — list all risks
router.get("/", async (_req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM risk_register ORDER BY risk_score DESC, created_at DESC");
      if (result.rows.length > 0) {
        const risks = result.rows;
        const byStatus: Record<string, number> = {};
        const byCategory: Record<string, number> = {};
        const byLikelihood: Record<string, number> = {};
        const byImpact: Record<string, number> = {};
        let critical = 0;
        for (const r of risks) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
          byLikelihood[r.likelihood] = (byLikelihood[r.likelihood] ?? 0) + 1;
          byImpact[r.impact] = (byImpact[r.impact] ?? 0) + 1;
          if (parseFloat(r.risk_score) >= 15 && r.status !== "closed") critical++;
        }
        return res.json(successEnvelope("gda-risk-register", "list", {
          risks,
          total: risks.length,
          critical,
          byStatus,
          byCategory,
          byLikelihood,
          byImpact,
          source: "database",
        }));
      }
    } catch { /* fall through to mock */ }
  }

  res.json(successEnvelope("gda-risk-register", "list", {
    risks: [],
    total: 0,
    critical: 0,
    byCategory: {},
    byStatus: {},
    byLikelihood: {},
    byImpact: {},
    source: "db",
  }));
});

// GET /api/risk-register/:id — single risk
router.get("/:id", async (req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM risk_register WHERE id = $1", [req.params.id]);
      if (result.rows.length > 0) {
        return res.json(successEnvelope("gda-risk-register", "get", result.rows[0]));
      }
    } catch { /* fall through */ }
  }

  return res.status(404).json(errorEnvelope("gda-risk-register", "get", {
    code: "NOT_FOUND",
    message: `Risk ${req.params.id} not found`,
    detail: null,
  }));
});

// GET /api/risk-register/by-opportunity/:oppId — risks for a specific opportunity
router.get("/by-opportunity/:oppId", async (req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM risk_register WHERE opportunity_id = $1 ORDER BY risk_score DESC",
        [req.params.oppId],
      );
      if (result.rows.length > 0) {
        return res.json(successEnvelope("gda-risk-register", "by-opportunity", {
          risks: result.rows,
          total: result.rows.length,
          source: "database",
        }));
      }
    } catch { /* fall through */ }
  }

  res.json(successEnvelope("gda-risk-register", "by-opportunity", {
    risks: [],
    total: 0,
    source: "db",
  }));
});

// PATCH /api/risk-register/:id/status — change risk status (Accept, Close, Escalate, Reopen)
router.patch("/:id/status", async (req, res) => {
  const { status, note } = req.body ?? {};
  const validStatuses = ["open", "mitigating", "accepted", "closed", "escalated"];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json(errorEnvelope("gda-risk-register", "update-status", {
      code: "INVALID_STATUS",
      message: `status must be one of: ${validStatuses.join(", ")}`,
      detail: null,
    }));
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-risk-register", "update-status", {
      code: "NO_DB", message: "Database not available", detail: null,
    }));
  }

  try {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE risk_register SET status = $1, updated_at = $2 WHERE id = $3 RETURNING id, status`,
      [status, now, req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("gda-risk-register", "update-status", {
        code: "NOT_FOUND", message: `Risk ${req.params.id} not found`, detail: null,
      }));
    }
    return res.json(successEnvelope("gda-risk-register", "update-status", {
      ...result.rows[0],
      note: note ?? null,
    }));
  } catch (err: unknown) {
    return res.status(500).json(errorEnvelope("gda-risk-register", "update-status", {
      code: "DB_ERROR", message: (err as Error).message, detail: null,
    }));
  }
});

// POST /api/risk-register/evaluate — if-this-then-that rule evaluation (dry-run capable)
router.post("/evaluate", async (req, res) => {
  const { if_statement, context, dry_run } = req.body ?? {};

  if (!if_statement || typeof if_statement !== "string") {
    return res.status(400).json(errorEnvelope("gda-risk-register", "evaluate", {
      code: "VALIDATION_ERROR",
      message: "if_statement is required",
      detail: null,
    }));
  }

  const pool = getPool();
  let matches: Array<Record<string, unknown>> = [];
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM risk_register WHERE status != 'closed' AND (LOWER(if_statement) LIKE $1 OR $2 LIKE '%' || LOWER(if_statement) || '%')",
        [`%${if_statement.toLowerCase()}%`, if_statement.toLowerCase()],
      );
      matches = result.rows;
    } catch { /* empty */ }
  }

  const evaluation = {
    if_statement,
    context: context ?? null,
    matches: matches.map((r) => ({
      risk_id: r.id,
      if_statement: r.if_statement,
      then_statement: r.then_statement,
      risk_score: r.risk_score,
      status: r.status,
      mitigation_plan: r.mitigation_plan,
    })),
    total_matches: matches.length,
    recommendation: matches.length > 0
      ? `${matches.length} existing risk(s) related to this scenario. Review mitigation plans.`
      : "No existing risks match this scenario. Consider adding a new risk entry.",
    dry_run: dry_run !== false,
  };

  res.json(successEnvelope("gda-risk-register", "evaluate", evaluation, {}, dry_run !== false));
});

export default router;
