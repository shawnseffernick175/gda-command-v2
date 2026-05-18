import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import { recordVersion } from "../lib/versioning";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/capture-discipline/dashboard
// Stage funnel + gate review summary + guardrail alerts
// ---------------------------------------------------------------------------
router.get("/dashboard", async (_req, res) => {
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope("gda-capture-discipline", "dashboard", {
        funnel: [],
        gate_summary: [],
        alerts: [],
        metrics: { total: 0, with_gates: 0, overdue: 0, at_risk: 0 },
      })
    );
  }

  try {
    // Stage funnel: count opportunities by capture_stage
    const funnelRes = await pool.query(`
      SELECT COALESCE(capture_stage, status) AS stage, COUNT(*) AS count,
             COALESCE(SUM(value_estimated), 0) AS total_value
      FROM opportunities
      WHERE deleted_at IS NULL AND status NOT IN ('no_bid', 'rejected')
      GROUP BY COALESCE(capture_stage, status)
      ORDER BY count DESC
    `);

    // Gate review summary
    const gateRes = await pool.query(`
      SELECT gate, status, COUNT(*) AS count
      FROM capture_gate_reviews
      GROUP BY gate, status
      ORDER BY gate, status
    `);

    // Active guardrail alerts
    const alertRes = await pool.query(`
      SELECT a.id, a.opportunity_id, a.rule, a.severity, a.message,
             a.resolved, a.created_at,
             o.title AS opp_title
      FROM capture_guardrail_alerts a
      JOIN opportunities o ON o.id = a.opportunity_id
      WHERE a.resolved = false
      ORDER BY
        CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        a.created_at DESC
      LIMIT 50
    `);

    // High-level metrics
    const metricsRes = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM capture_gate_reviews g WHERE g.opportunity_id = o.id
        ) THEN 1 END) AS with_gates,
        COUNT(CASE WHEN o.due_date < NOW() AND o.status NOT IN ('won','lost','no_bid','rejected') THEN 1 END) AS overdue,
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM capture_guardrail_alerts g
          WHERE g.opportunity_id = o.id AND g.resolved = false AND g.severity = 'critical'
        ) THEN 1 END) AS at_risk
      FROM opportunities o
      WHERE o.deleted_at IS NULL AND o.status NOT IN ('no_bid','rejected')
    `);

    const metrics = metricsRes.rows[0] ?? { total: 0, with_gates: 0, overdue: 0, at_risk: 0 };

    res.json(
      successEnvelope("gda-capture-discipline", "dashboard", {
        funnel: funnelRes.rows,
        gate_summary: gateRes.rows,
        alerts: alertRes.rows,
        metrics: {
          total: Number(metrics.total),
          with_gates: Number(metrics.with_gates),
          overdue: Number(metrics.overdue),
          at_risk: Number(metrics.at_risk),
        },
      })
    );
  } catch (err) {
    process.stderr.write(`[capture-discipline] dashboard error: ${(err as Error).message}\n`);
    res.status(500).json(
      errorEnvelope("gda-capture-discipline", "dashboard", {
        code: "INTERNAL",
        message: "Failed to load capture discipline dashboard.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/capture-discipline/gates/:opportunityId
// Gate reviews for a specific opportunity
// ---------------------------------------------------------------------------
router.get("/gates/:opportunityId", async (req, res) => {
  const { opportunityId } = req.params;
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope("gda-capture-discipline", "gates", { gates: [] })
    );
  }

  try {
    const result = await pool.query(
      `SELECT * FROM capture_gate_reviews
       WHERE opportunity_id = $1
       ORDER BY CASE gate
         WHEN 'qualify' THEN 1
         WHEN 'pursue' THEN 2
         WHEN 'solicitation' THEN 3
         WHEN 'post_submittal' THEN 4
         WHEN 'bid_validation' THEN 5
       END`,
      [opportunityId]
    );

    res.json(
      successEnvelope("gda-capture-discipline", "gates", { gates: result.rows })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("gda-capture-discipline", "gates", {
        code: "INTERNAL",
        message: "Failed to load gate reviews.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/capture-discipline/gates
// Create or update a gate review
// ---------------------------------------------------------------------------
router.post("/gates", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const pool = getPool();

  if (!pool) {
    return res.status(503).json(
      errorEnvelope("gda-capture-discipline", "create-gate", {
        code: "DB_UNAVAILABLE",
        message: "Database not available.",
        detail: null,
      })
    );
  }

  const { opportunity_id, gate, status, reviewer, notes, criteria_met, criteria_total } = req.body as {
    opportunity_id: string;
    gate: string;
    status: string;
    reviewer?: string;
    notes?: string;
    criteria_met?: number;
    criteria_total?: number;
  };

  if (!opportunity_id || !gate || !status) {
    return res.status(400).json(
      errorEnvelope("gda-capture-discipline", "create-gate", {
        code: "INVALID_INPUT",
        message: "opportunity_id, gate, and status are required.",
        detail: null,
      })
    );
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const upsertRes = await pool.query(
      `INSERT INTO capture_gate_reviews
        (id, opportunity_id, gate, status, reviewer, reviewed_at, criteria_met, criteria_total, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       ON CONFLICT (opportunity_id, gate) DO UPDATE SET
        status = EXCLUDED.status,
        reviewer = EXCLUDED.reviewer,
        reviewed_at = EXCLUDED.reviewed_at,
        criteria_met = EXCLUDED.criteria_met,
        criteria_total = EXCLUDED.criteria_total,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at
       RETURNING *, (xmax = 0) AS is_insert`,
      [id, opportunity_id, gate, status, reviewer ?? null, status !== "pending" ? now : null, criteria_met ?? 0, criteria_total ?? 0, notes ?? null, now]
    );

    // Record version for audit
    const userId = req.user?.userId ?? "system";
    const row = upsertRes.rows[0];
    if (row) {
      const changeType = row.is_insert ? "create" : "update";
      const { is_insert: _, ...snapshot } = row;
      await recordVersion("capture_gate_reviews", row.id, snapshot, userId, changeType);
    }

    const { is_insert: _flag, ...cleanRow } = row ?? ({} as Record<string, unknown>);
    res.json(
      successEnvelope("gda-capture-discipline", "create-gate", {
        gate_review: Object.keys(cleanRow).length > 0 ? cleanRow : { id, opportunity_id, gate, status },
      })
    );
  } catch (err) {
    process.stderr.write(`[capture-discipline] create gate error: ${(err as Error).message}\n`);
    res.status(500).json(
      errorEnvelope("gda-capture-discipline", "create-gate", {
        code: "INTERNAL",
        message: "Failed to save gate review.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/capture-discipline/check-guardrails/:opportunityId
// Run guardrail checks for an opportunity
// ---------------------------------------------------------------------------
router.post("/check-guardrails/:opportunityId", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const { opportunityId } = req.params;
  const pool = getPool();

  if (!pool) {
    return res.status(503).json(
      errorEnvelope("gda-capture-discipline", "check-guardrails", {
        code: "DB_UNAVAILABLE",
        message: "Database not available.",
        detail: null,
      })
    );
  }

  try {
    // Fetch opportunity
    const oppRes = await pool.query(
      "SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL",
      [opportunityId]
    );

    if (oppRes.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-capture-discipline", "check-guardrails", {
          code: "NOT_FOUND",
          message: "Opportunity not found.",
          detail: null,
        })
      );
    }

    const opp = oppRes.rows[0];
    const newAlerts: Array<{ rule: string; severity: string; message: string }> = [];

    // Guardrail 1: Overdue opportunity
    if (opp.due_date && new Date(opp.due_date) < new Date() && !["won", "lost", "no_bid", "rejected"].includes(opp.status)) {
      newAlerts.push({
        rule: "overdue",
        severity: "critical",
        message: `Opportunity "${opp.title}" is past its due date.`,
      });
    }

    // Guardrail 2: Missing score
    if (opp.score === null || opp.score === undefined || Number(opp.score) === 0) {
      newAlerts.push({
        rule: "missing_score",
        severity: "warning",
        message: `Opportunity "${opp.title}" has no fit score assigned.`,
      });
    }

    // Guardrail 3: High value without gate review
    if (opp.value_estimated && Number(opp.value_estimated) > 5000000) {
      const gateRes = await pool.query(
        "SELECT COUNT(*) AS cnt FROM capture_gate_reviews WHERE opportunity_id = $1",
        [opportunityId]
      );
      if (Number(gateRes.rows[0]?.cnt) === 0) {
        newAlerts.push({
          rule: "high_value_no_gate",
          severity: "warning",
          message: `High-value opportunity "${opp.title}" ($${(opp.value_estimated / 1e6).toFixed(1)}M) has no gate reviews.`,
        });
      }
    }

    // Guardrail 4: Stage advancement without gate review
    const stageOrder = ["interest", "qualify", "pursue", "solicitation", "post_submittal"];
    const currentStageIdx = stageOrder.indexOf(opp.capture_stage ?? opp.status);
    if (currentStageIdx >= 2) {
      const requiredGate = stageOrder[currentStageIdx - 1];
      const gateRes = await pool.query(
        "SELECT status FROM capture_gate_reviews WHERE opportunity_id = $1 AND gate = $2",
        [opportunityId, requiredGate]
      );
      if (gateRes.rows.length === 0 || !["passed", "waived"].includes(gateRes.rows[0].status)) {
        newAlerts.push({
          rule: "stage_without_gate",
          severity: "warning",
          message: `Opportunity is at "${opp.capture_stage ?? opp.status}" stage without a completed gate review.`,
        });
      }
    }

    // Insert new alerts (skip duplicates)
    for (const alert of newAlerts) {
      const existing = await pool.query(
        "SELECT id FROM capture_guardrail_alerts WHERE opportunity_id = $1 AND rule = $2 AND resolved = false",
        [opportunityId, alert.rule]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          "INSERT INTO capture_guardrail_alerts (id, opportunity_id, rule, severity, message) VALUES ($1, $2, $3, $4, $5)",
          [crypto.randomUUID(), opportunityId, alert.rule, alert.severity, alert.message]
        );
      }
    }

    res.json(
      successEnvelope("gda-capture-discipline", "check-guardrails", {
        alerts: newAlerts,
        checked: 4,
      })
    );
  } catch (err) {
    process.stderr.write(`[capture-discipline] guardrail check error: ${(err as Error).message}\n`);
    res.status(500).json(
      errorEnvelope("gda-capture-discipline", "check-guardrails", {
        code: "INTERNAL",
        message: "Failed to run guardrail checks.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/capture-discipline/alerts/:id/resolve
// Resolve a guardrail alert
// ---------------------------------------------------------------------------
router.post("/alerts/:id/resolve", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const { id } = req.params;
  const pool = getPool();

  if (!pool) {
    return res.status(503).json(
      errorEnvelope("gda-capture-discipline", "resolve-alert", {
        code: "DB_UNAVAILABLE",
        message: "Database not available.",
        detail: null,
      })
    );
  }

  try {
    const userId = req.user?.userId ?? "system";
    const result = await pool.query(
      "UPDATE capture_guardrail_alerts SET resolved = true, resolved_by = $1, resolved_at = NOW() WHERE id = $2 AND resolved = false RETURNING id",
      [userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-capture-discipline", "resolve-alert", {
          code: "NOT_FOUND",
          message: "Alert not found or already resolved.",
          detail: null,
        })
      );
    }

    res.json(
      successEnvelope("gda-capture-discipline", "resolve-alert", { id, resolved: true })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("gda-capture-discipline", "resolve-alert", {
        code: "INTERNAL",
        message: "Failed to resolve alert.",
        detail: null,
      })
    );
  }
});

export default router;
