/**
 * Shipley Capture Discipline routes — W6.
 * Dashboard widgets, phase-advance guardrails, color-team reviews,
 * and admin-tunable thresholds.
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import { recordVersion } from "../lib/versioning";
import type {
  ShipleyPhase,
  ColorTeamColor,
  DisciplineDashboard,
  CaptureDisciplineConfig,
  PhaseAdvanceValidation,
} from "@gda/shared";

const router = Router();

const PHASE_ORDER: ShipleyPhase[] = [
  "identify", "qualify", "pursue", "capture", "proposal", "submit", "awarded", "lost", "no_bid",
];

const ACTIVE_PHASES: ShipleyPhase[] = ["identify", "qualify", "pursue", "capture", "proposal", "submit"];

const QUALIFIED_PHASES: ShipleyPhase[] = ["capture", "proposal", "submit"];

const COLOR_TEAM_ORDER: ColorTeamColor[] = ["blue", "pink", "red", "green", "gold", "white"];

const TERMINAL_PHASES: ShipleyPhase[] = ["awarded", "lost", "no_bid"];

// Map ShipleyPhase → DB status and capture_stage to keep all columns in sync
const PHASE_TO_STATUS: Record<ShipleyPhase, string> = {
  identify: "discovery", qualify: "qualified", pursue: "pipeline",
  capture: "pipeline", proposal: "pipeline", submit: "pipeline",
  awarded: "won", lost: "lost", no_bid: "no_bid",
};
const PHASE_TO_CAPTURE_STAGE: Record<ShipleyPhase, string> = {
  identify: "interest", qualify: "qualify", pursue: "pursue",
  capture: "pursue", proposal: "solicitation", submit: "post_submittal",
  awarded: "won", lost: "lost", no_bid: "no_bid",
};

function isForwardTransition(current: ShipleyPhase, target: ShipleyPhase): boolean {
  // Terminal states are always reachable from active phases
  if (TERMINAL_PHASES.includes(target)) return true;
  // Cannot move out of a terminal state without force
  if (TERMINAL_PHASES.includes(current)) return false;
  const currentIdx = PHASE_ORDER.indexOf(current);
  const targetIdx = PHASE_ORDER.indexOf(target);
  return targetIdx > currentIdx;
}

// ---------------------------------------------------------------------------
// GET /api/discipline/dashboard — aggregate dashboard data
// ---------------------------------------------------------------------------
router.get("/dashboard", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "dashboard", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  try {
    // 1. Pipeline coverage
    const configResult = await pool.query("SELECT * FROM capture_discipline_config WHERE id = 1");
    const config: CaptureDisciplineConfig = configResult.rows[0] ?? {
      revenue_target_usd: 40000000, pipeline_coverage_min: 3.0, pipeline_coverage_target: 5.0,
      captures_per_manager_max: 5, proposals_per_manager_max: 2,
    };

    const qualifiedValue = await pool.query(
      `SELECT COALESCE(SUM(value_estimated), 0) AS total
       FROM opportunities
       WHERE deleted_at IS NULL
         AND shipley_phase IN ('capture', 'proposal', 'submit')
         AND status NOT IN ('no_bid', 'lost', 'gov_cancelled')`
    );
    const qualVal = Number(qualifiedValue.rows[0].total);
    const revTarget = Number(config.revenue_target_usd);

    // 2. Funnel by phase
    const funnelResult = await pool.query(
      `SELECT shipley_phase AS phase,
              COUNT(*)::int AS count,
              COALESCE(SUM(value_estimated), 0) AS value
       FROM opportunities
       WHERE deleted_at IS NULL AND shipley_phase IS NOT NULL
       GROUP BY shipley_phase
       ORDER BY ARRAY_POSITION(ARRAY['identify','qualify','pursue','capture','proposal','submit','awarded','lost','no_bid'], shipley_phase::text)`
    );

    // 3. Capture load per manager
    const captureLoad = await pool.query(
      `SELECT capture_manager_id AS manager_id,
              COUNT(*)::int AS active_captures
       FROM opportunities
       WHERE deleted_at IS NULL
         AND capture_manager_id IS NOT NULL
         AND shipley_phase IN ('pursue', 'capture', 'proposal')
       GROUP BY capture_manager_id
       ORDER BY active_captures DESC`
    );

    // 4. Proposal load per manager
    const proposalLoad = await pool.query(
      `SELECT proposal_manager_id AS manager_id,
              COUNT(*)::int AS active_proposals
       FROM opportunities
       WHERE deleted_at IS NULL
         AND proposal_manager_id IS NOT NULL
         AND shipley_phase IN ('proposal', 'submit')
       GROUP BY proposal_manager_id
       ORDER BY active_proposals DESC`
    );

    // 5. Aging captures (no update in > 30 days)
    const aging = await pool.query(
      `SELECT id, title, shipley_phase,
              EXTRACT(DAY FROM NOW() - updated_at)::int AS days_stale
       FROM opportunities
       WHERE deleted_at IS NULL
         AND shipley_phase IN ('identify', 'qualify', 'pursue', 'capture', 'proposal')
         AND updated_at < NOW() - INTERVAL '30 days'
       ORDER BY updated_at ASC
       LIMIT 50`
    );

    // 6. Pursuits missing expected RFP date
    const missingRfp = await pool.query(
      `SELECT id, title, shipley_phase
       FROM opportunities
       WHERE deleted_at IS NULL
         AND shipley_phase IN ('pursue', 'capture', 'proposal')
         AND expected_rfp_date IS NULL
       ORDER BY title
       LIMIT 50`
    );

    const dashboard: DisciplineDashboard = {
      pipeline_coverage: {
        qualified_value: qualVal,
        revenue_target: revTarget,
        coverage_ratio: revTarget > 0 ? qualVal / revTarget : 0,
        min_ratio: Number(config.pipeline_coverage_min),
        target_ratio: Number(config.pipeline_coverage_target),
      },
      funnel: funnelResult.rows.map((r) => ({
        phase: r.phase as ShipleyPhase,
        count: Number(r.count),
        value: Number(r.value),
      })),
      capture_load: captureLoad.rows.map((r) => ({
        manager_id: r.manager_id,
        active_captures: Number(r.active_captures),
        max: Number(config.captures_per_manager_max),
      })),
      proposal_load: proposalLoad.rows.map((r) => ({
        manager_id: r.manager_id,
        active_proposals: Number(r.active_proposals),
        max: Number(config.proposals_per_manager_max),
      })),
      aging_captures: aging.rows.map((r) => ({
        id: r.id,
        title: r.title,
        shipley_phase: r.shipley_phase as ShipleyPhase,
        days_stale: Number(r.days_stale),
      })),
      missing_rfp_date: missingRfp.rows.map((r) => ({
        id: r.id,
        title: r.title,
        shipley_phase: r.shipley_phase as ShipleyPhase,
      })),
    };

    res.json(successEnvelope("discipline", "dashboard", dashboard));
  } catch (err) {
    log.error("discipline_dashboard_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "dashboard", { code: "QUERY_ERROR", message: "Failed to load discipline dashboard", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/discipline/config — get thresholds
// ---------------------------------------------------------------------------
router.get("/config", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "config", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }
  try {
    const { rows } = await pool.query("SELECT * FROM capture_discipline_config WHERE id = 1");
    res.json(successEnvelope("discipline", "config", rows[0] ?? null));
  } catch (err) {
    log.error("discipline_config_get_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "config", { code: "QUERY_ERROR", message: "Failed to load config", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// PUT /api/discipline/config — update thresholds (admin only)
// ---------------------------------------------------------------------------
router.put("/config", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "config-update", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const {
    revenue_target_usd, pipeline_coverage_min, pipeline_coverage_target,
    pwin_floor_pursue, pwin_floor_capture, pwin_floor_bid_decision,
    captures_per_manager_max, proposals_per_manager_max, task_orders_per_manager_max,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE capture_discipline_config SET
        revenue_target_usd = COALESCE($1, revenue_target_usd),
        pipeline_coverage_min = COALESCE($2, pipeline_coverage_min),
        pipeline_coverage_target = COALESCE($3, pipeline_coverage_target),
        pwin_floor_pursue = COALESCE($4, pwin_floor_pursue),
        pwin_floor_capture = COALESCE($5, pwin_floor_capture),
        pwin_floor_bid_decision = COALESCE($6, pwin_floor_bid_decision),
        captures_per_manager_max = COALESCE($7, captures_per_manager_max),
        proposals_per_manager_max = COALESCE($8, proposals_per_manager_max),
        task_orders_per_manager_max = COALESCE($9, task_orders_per_manager_max),
        updated_at = NOW()
      WHERE id = 1
      RETURNING *`,
      [
        revenue_target_usd ?? null, pipeline_coverage_min ?? null, pipeline_coverage_target ?? null,
        pwin_floor_pursue ?? null, pwin_floor_capture ?? null, pwin_floor_bid_decision ?? null,
        captures_per_manager_max ?? null, proposals_per_manager_max ?? null, task_orders_per_manager_max ?? null,
      ]
    );
    res.json(successEnvelope("discipline", "config-update", rows[0]));
  } catch (err) {
    log.error("discipline_config_update_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "config-update", { code: "QUERY_ERROR", message: "Failed to update config", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/discipline/validate-advance/:id — check if phase advance is allowed
// ---------------------------------------------------------------------------
router.post("/validate-advance/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "validate", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const { id } = req.params;
  const { target_phase } = req.body as { target_phase: ShipleyPhase };

  if (!target_phase || !PHASE_ORDER.includes(target_phase)) {
    res.status(400).json(errorEnvelope("discipline", "validate", { code: "VALIDATION", message: "Invalid target_phase", detail: null }));
    return;
  }

  try {
    const { rows: oppRows } = await pool.query(
      "SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (oppRows.length === 0) {
      res.status(404).json(errorEnvelope("discipline", "validate", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
      return;
    }

    const opp = oppRows[0];
    const currentPhase = (opp.shipley_phase ?? "identify") as ShipleyPhase;
    const missing_fields: string[] = [];
    const missing_color_teams: ColorTeamColor[] = [];

    // Phase ordering: only forward transitions allowed (terminal states always reachable)
    if (!isForwardTransition(currentPhase, target_phase)) {
      missing_fields.push(`Cannot move from '${currentPhase}' to '${target_phase}' — only forward transitions allowed`);
    }

    // Qualify → Pursue: need pwin, incumbent, preferred_vendor_analysis
    if (target_phase === "pursue") {
      if (!opp.pwin && opp.pwin !== 0) missing_fields.push("pwin");
      if (!opp.incumbent) missing_fields.push("incumbent");
      if (!opp.preferred_vendor_analysis) missing_fields.push("preferred_vendor_analysis");
    }

    // Capture → Proposal: need all required color teams scheduled
    if (target_phase === "proposal") {
      const { rows: reviews } = await pool.query(
        "SELECT team_color FROM color_team_review WHERE opportunity_id = $1",
        [id]
      );
      const existing = new Set(reviews.map((r) => r.team_color));
      const required: ColorTeamColor[] = ["blue", "pink", "red"];
      for (const c of required) {
        if (!existing.has(c)) missing_color_teams.push(c);
      }
    }

    // Pwin floor checks
    const configResult = await pool.query("SELECT * FROM capture_discipline_config WHERE id = 1");
    const config = configResult.rows[0];
    if (config) {
      const pwin = Number(opp.pwin ?? 0);
      if (target_phase === "pursue" && pwin < Number(config.pwin_floor_pursue)) {
        missing_fields.push(`pwin must be ≥ ${config.pwin_floor_pursue}% (currently ${pwin}%)`);
      }
      if (target_phase === "capture" && pwin < Number(config.pwin_floor_capture)) {
        missing_fields.push(`pwin must be ≥ ${config.pwin_floor_capture}% (currently ${pwin}%)`);
      }
      if ((target_phase === "proposal" || target_phase === "submit") && pwin < Number(config.pwin_floor_bid_decision)) {
        missing_fields.push(`pwin must be ≥ ${config.pwin_floor_bid_decision}% (currently ${pwin}%)`);
      }
    }

    const result: PhaseAdvanceValidation = {
      allowed: missing_fields.length === 0 && missing_color_teams.length === 0,
      missing_fields,
      missing_color_teams,
    };

    res.json(successEnvelope("discipline", "validate", result));
  } catch (err) {
    log.error("discipline_validate_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "validate", { code: "QUERY_ERROR", message: "Validation failed", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/discipline/advance/:id — advance Shipley phase (with guardrails)
// ---------------------------------------------------------------------------
router.patch("/advance/:id", requireRole("admin", "bd_manager"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "advance", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const { id } = req.params;
  const { target_phase, force } = req.body as { target_phase: ShipleyPhase; force?: boolean };

  if (!target_phase || !PHASE_ORDER.includes(target_phase)) {
    res.status(400).json(errorEnvelope("discipline", "advance", { code: "VALIDATION", message: "Invalid target_phase", detail: null }));
    return;
  }

  try {
    // Run validation first
    const { rows: oppRows } = await pool.query(
      "SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (oppRows.length === 0) {
      res.status(404).json(errorEnvelope("discipline", "advance", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
      return;
    }

    // Validate
    const opp = oppRows[0];
    const currentPhase = (opp.shipley_phase ?? "identify") as ShipleyPhase;
    const missing_fields: string[] = [];
    const missing_color_teams: ColorTeamColor[] = [];

    // Phase ordering: only forward transitions unless force=true
    if (!force && !isForwardTransition(currentPhase, target_phase)) {
      missing_fields.push(`Cannot move from '${currentPhase}' to '${target_phase}' — only forward transitions allowed (pass force: true to override)`);
    }

    if (target_phase === "pursue") {
      if (!opp.pwin && opp.pwin !== 0) missing_fields.push("pwin");
      if (!opp.incumbent) missing_fields.push("incumbent");
      if (!opp.preferred_vendor_analysis) missing_fields.push("preferred_vendor_analysis");
    }

    if (target_phase === "proposal") {
      const { rows: reviews } = await pool.query(
        "SELECT team_color FROM color_team_review WHERE opportunity_id = $1",
        [id]
      );
      const existing = new Set(reviews.map((r) => r.team_color));
      const required: ColorTeamColor[] = ["blue", "pink", "red"];
      for (const c of required) {
        if (!existing.has(c)) missing_color_teams.push(c);
      }
    }

    const configResult = await pool.query("SELECT * FROM capture_discipline_config WHERE id = 1");
    const config = configResult.rows[0];
    if (config) {
      const pwin = Number(opp.pwin ?? 0);
      if (target_phase === "pursue" && pwin < Number(config.pwin_floor_pursue)) {
        missing_fields.push(`pwin must be ≥ ${config.pwin_floor_pursue}%`);
      }
      if (target_phase === "capture" && pwin < Number(config.pwin_floor_capture)) {
        missing_fields.push(`pwin must be ≥ ${config.pwin_floor_capture}%`);
      }
      if ((target_phase === "proposal" || target_phase === "submit") && pwin < Number(config.pwin_floor_bid_decision)) {
        missing_fields.push(`pwin must be ≥ ${config.pwin_floor_bid_decision}%`);
      }
    }

    if (missing_fields.length > 0 || missing_color_teams.length > 0) {
      res.status(400).json(errorEnvelope("discipline", "advance", {
        code: "GUARDRAIL_BLOCKED",
        message: "Cannot advance phase — missing required fields or color-team gates",
        detail: JSON.stringify({ missing_fields, missing_color_teams }),
      }));
      return;
    }

    // Advance phase — sync status and capture_stage to keep all surfaces consistent
    const newStatus = PHASE_TO_STATUS[target_phase] ?? "discovery";
    const newCaptureStage = PHASE_TO_CAPTURE_STAGE[target_phase] ?? "interest";
    const { rows: updated } = await pool.query(
      `UPDATE opportunities SET shipley_phase = $2, status = $3, capture_stage = $4, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, target_phase, newStatus, newCaptureStage]
    );

    const userId = req.user?.userId ?? "system";
    if (updated[0]) {
      await recordVersion("opportunities", id, updated[0], userId, "update", opp);
    }

    res.json(successEnvelope("discipline", "advance", { opportunity: updated[0] ?? null, new_phase: target_phase }));
  } catch (err) {
    log.error("discipline_advance_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "advance", { code: "QUERY_ERROR", message: "Phase advance failed", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// Color Team Review CRUD
// ---------------------------------------------------------------------------

// GET /api/discipline/color-reviews/:opportunityId
router.get("/color-reviews/:opportunityId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "color-reviews", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM color_team_review WHERE opportunity_id = $1
       ORDER BY ARRAY_POSITION(ARRAY['blue','pink','red','green','gold','white'], team_color)`,
      [req.params.opportunityId]
    );
    res.json(successEnvelope("discipline", "color-reviews", { reviews: rows }));
  } catch (err) {
    log.error("color_review_list_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "color-reviews", { code: "QUERY_ERROR", message: "Failed to list reviews", detail: null }));
  }
});

// POST /api/discipline/color-reviews/:opportunityId
router.post("/color-reviews/:opportunityId", requireRole("admin", "bd_manager"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("discipline", "color-review-create", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const { opportunityId } = req.params;
  const { team_color, scheduled_date, completed_date, score, notes } = req.body;

  if (!team_color || !COLOR_TEAM_ORDER.includes(team_color)) {
    res.status(400).json(errorEnvelope("discipline", "color-review-create", { code: "VALIDATION", message: `team_color must be one of: ${COLOR_TEAM_ORDER.join(", ")}`, detail: null }));
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO color_team_review (opportunity_id, team_color, scheduled_date, completed_date, score, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (opportunity_id, team_color) DO UPDATE SET
         scheduled_date = EXCLUDED.scheduled_date,
         completed_date = EXCLUDED.completed_date,
         score = EXCLUDED.score,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [opportunityId, team_color, scheduled_date ?? null, completed_date ?? null, score ?? null, notes ?? null]
    );
    res.json(successEnvelope("discipline", "color-review-create", rows[0]));
  } catch (err) {
    log.error("color_review_create_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("discipline", "color-review-create", { code: "QUERY_ERROR", message: "Failed to create/update review", detail: null }));
  }
});

export default router;
