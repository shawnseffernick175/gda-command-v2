import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import {
  MOCK_CAPTURE_PLANS,
  MOCK_CAPTURE_ACTIVITIES,
} from "../data/capture-mock";
import { n8nWebhookConfigured, fetchCapturePlansFromN8n } from "../lib/n8n-data";
import type { CapturePlan } from "@gda/shared";

const router = Router();

function rowToCapturePlan(r: Record<string, unknown>): CapturePlan {
  return {
    id: r.id as string,
    opportunity_id: (r.opportunity_id as string) ?? "",
    opportunity_title: r.opportunity_title as string,
    agency: (r.agency as string) ?? "",
    phase: r.phase as CapturePlan["phase"],
    pwin: Number(r.pwin),
    value_estimated: Number(r.value_estimated),
    capture_manager: (r.capture_manager as string) ?? "",
    bid_decision: r.bid_decision as CapturePlan["bid_decision"],
    teaming_partners: (r.teaming_partners as CapturePlan["teaming_partners"]) ?? [],
    milestones: (r.milestones as CapturePlan["milestones"]) ?? [],
    gate_reviews: (r.gate_reviews as CapturePlan["gate_reviews"]) ?? [],
    win_themes: (r.win_themes as string[]) ?? [],
    discriminators: (r.discriminators as string[]) ?? [],
    risks: (r.risks as CapturePlan["risks"]) ?? [],
    data_source: (r.data_source as string) ?? null,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Helper: compute summary stats from a plan array
// ---------------------------------------------------------------------------
function computePlanStats(allPlans: CapturePlan[], filteredPlans: CapturePlan[]) {
  const totalValue = allPlans.reduce((s, p) => s + p.value_estimated, 0);
  const avgPwin = allPlans.length > 0
    ? Math.round(allPlans.reduce((s, p) => s + p.pwin, 0) / allPlans.length)
    : 0;

  const phases: Record<string, number> = {};
  for (const p of allPlans) {
    phases[p.phase] = (phases[p.phase] || 0) + 1;
  }

  const decisions: Record<string, number> = {};
  for (const p of allPlans) {
    decisions[p.bid_decision] = (decisions[p.bid_decision] || 0) + 1;
  }

  const allMilestones = allPlans.flatMap((p) => p.milestones);
  const atRiskCount = allMilestones.filter(
    (m) => m.status === "at_risk" || m.status === "overdue"
  ).length;
  const upcomingMilestones = allMilestones
    .filter((m) => m.status !== "completed")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  return {
    total: allPlans.length,
    filtered: filteredPlans.length,
    totalValue,
    avgPwin,
    phases,
    decisions,
    atRiskMilestones: atRiskCount,
    upcomingMilestones,
  };
}

// ---------------------------------------------------------------------------
// GET /api/capture/plans — list capture plans with filtering
// ---------------------------------------------------------------------------
router.get("/plans", async (_req, res) => {
  const {
    phase,
    bid_decision,
    search,
    sortBy = "updated_at",
    sortDir = "desc",
  } = _req.query as Record<string, string | undefined>;

  let allPlans: CapturePlan[];
  let source: "n8n" | "db" | "mock" = "mock";

  // Try n8n first
  if (n8nWebhookConfigured()) {
    try {
      const result = await fetchCapturePlansFromN8n();
      if (result.ok && result.plans.length > 0) {
        allPlans = result.plans;
        source = "n8n";
      } else {
        allPlans = [...MOCK_CAPTURE_PLANS];
      }
    } catch {
      allPlans = [...MOCK_CAPTURE_PLANS];
    }
  } else {
    // Try DB
    const pool = getPool();
    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM capture_plans ORDER BY updated_at DESC");
        if (result.rows.length > 0) {
          allPlans = result.rows.map(rowToCapturePlan);
          source = "db";
        } else {
          allPlans = [...MOCK_CAPTURE_PLANS];
        }
      } catch {
        allPlans = [...MOCK_CAPTURE_PLANS];
      }
    } else {
      allPlans = [...MOCK_CAPTURE_PLANS];
    }
  }

  let plans = [...allPlans];

  if (phase) plans = plans.filter((p) => p.phase === phase);
  if (bid_decision) plans = plans.filter((p) => p.bid_decision === bid_decision);
  if (search) {
    const q = search.toLowerCase();
    plans = plans.filter(
      (p) =>
        p.opportunity_title.toLowerCase().includes(q) ||
        p.agency.toLowerCase().includes(q) ||
        p.capture_manager.toLowerCase().includes(q)
    );
  }

  const dir = sortDir === "asc" ? 1 : -1;
  plans.sort((a, b) => {
    const key = sortBy as keyof typeof a;
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
  });

  const stats = computePlanStats(allPlans, plans);

  res.json(
    successEnvelope("GDA.capture", "list-plans", { plans, ...stats, source })
  );
});

// ---------------------------------------------------------------------------
// GET /api/capture/plans/:id — single capture plan detail
// ---------------------------------------------------------------------------
router.get("/plans/:id", async (req, res) => {
  let plan: CapturePlan | undefined;
  let source: "n8n" | "db" | "mock" = "mock";

  if (n8nWebhookConfigured()) {
    try {
      const result = await fetchCapturePlansFromN8n();
      if (result.ok && result.plans.length > 0) {
        plan = result.plans.find((p) => p.id === req.params.id);
        if (plan) source = "n8n";
      }
    } catch { /* fall through */ }
  }

  if (!plan) {
    const pool = getPool();
    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM capture_plans WHERE id = $1", [req.params.id]);
        if (result.rows.length > 0) {
          plan = rowToCapturePlan(result.rows[0]);
          source = "db";
        }
      } catch { /* fall through */ }
    }
  }

  if (!plan) {
    plan = MOCK_CAPTURE_PLANS.find((p) => p.id === req.params.id);
  }

  if (!plan) {
    res.status(404).json(
      errorEnvelope("GDA.capture", "plan-detail", { code: "NOT_FOUND", message: "Capture plan not found", detail: null })
    );
    return;
  }

  // Get activities from DB or mock
  let activities;
  const pool = getPool();
  if (pool && source === "db") {
    try {
      const result = await pool.query(
        "SELECT * FROM capture_activities WHERE capture_plan_id = $1 ORDER BY performed_at DESC",
        [plan.id],
      );
      activities = result.rows.map((r) => ({
        ...r,
        performed_at: r.performed_at instanceof Date ? r.performed_at.toISOString() : r.performed_at,
      }));
    } catch {
      activities = MOCK_CAPTURE_ACTIVITIES.filter((a) => a.capture_plan_id === plan!.id)
        .sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());
    }
  } else {
    activities = MOCK_CAPTURE_ACTIVITIES.filter((a) => a.capture_plan_id === plan!.id)
      .sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());
  }

  res.json(
    successEnvelope("GDA.capture", "plan-detail", { plan, activities, source })
  );
});

// ---------------------------------------------------------------------------
// GET /api/capture/activities — BD activity log across all captures
// ---------------------------------------------------------------------------
router.get("/activities", async (_req, res) => {
  const { type, search, limit = "20" } = _req.query as Record<string, string | undefined>;

  const pool = getPool();
  let allActivities = MOCK_CAPTURE_ACTIVITIES;

  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM capture_activities ORDER BY performed_at DESC");
      if (result.rows.length > 0) {
        allActivities = result.rows.map((r) => ({
          ...r,
          performed_at: r.performed_at instanceof Date ? r.performed_at.toISOString() : r.performed_at,
        }));
      }
    } catch { /* fall through */ }
  }

  let activities = [...allActivities];

  if (type) activities = activities.filter((a) => a.activity_type === type);
  if (search) {
    const q = search.toLowerCase();
    activities = activities.filter(
      (a) =>
        a.description.toLowerCase().includes(q) ||
        a.opportunity_title.toLowerCase().includes(q) ||
        a.performed_by.toLowerCase().includes(q)
    );
  }

  activities.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());

  const typeCounts: Record<string, number> = {};
  for (const a of allActivities) typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;

  const limited = activities.slice(0, parseInt(limit!, 10));

  res.json(
    successEnvelope("GDA.capture", "activities", {
      activities: limited, total: allActivities.length, filtered: activities.length,
      returned: limited.length, typeCounts,
    })
  );
});

// ---------------------------------------------------------------------------
// POST /api/capture/gate-review — run gate review and store result
// ---------------------------------------------------------------------------
router.post("/gate-review", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const { capture_plan_id, gate } = req.body as {
    capture_plan_id?: string;
    gate?: string;
  };

  if (!capture_plan_id || !gate) {
    res.status(400).json(
      errorEnvelope("GDA.capture", "gate-review", { code: "BAD_REQUEST", message: "capture_plan_id and gate are required", detail: null })
    );
    return;
  }

  // Load plan from DB or mock
  let plan: CapturePlan | undefined;
  const pool = getPool();

  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM capture_plans WHERE id = $1", [capture_plan_id]);
      if (result.rows.length > 0) plan = rowToCapturePlan(result.rows[0]);
    } catch { /* fall through */ }
  }

  if (!plan) {
    plan = MOCK_CAPTURE_PLANS.find((p) => p.id === capture_plan_id);
  }

  if (!plan) {
    res.status(404).json(
      errorEnvelope("GDA.capture", "gate-review", { code: "NOT_FOUND", message: "Capture plan not found", detail: null })
    );
    return;
  }

  const correlationId = `GDA-GATE-${Date.now().toString(36).toUpperCase()}`;

  const checks = [
    {
      name: "Teaming Partners Confirmed",
      status: plan.teaming_partners.every((t) => t.status === "confirmed") ? "pass" as const : "warn" as const,
      message: plan.teaming_partners.every((t) => t.status === "confirmed")
        ? "All teaming partners confirmed"
        : `${plan.teaming_partners.filter((t) => t.status !== "confirmed").length} partner(s) not yet confirmed`,
    },
    {
      name: "Win Themes Defined",
      status: plan.win_themes.length >= 2 ? "pass" as const : "fail" as const,
      message: `${plan.win_themes.length} win theme(s) defined`,
    },
    {
      name: "Risks Mitigated",
      status: plan.risks.every((r) => r.mitigation.length > 0) ? "pass" as const : "fail" as const,
      message: plan.risks.every((r) => r.mitigation.length > 0) ? "All risks have mitigation plans" : "Some risks lack mitigation strategies",
    },
    {
      name: "Milestones On Track",
      status: plan.milestones.some((m) => m.status === "overdue") ? "fail" as const
        : plan.milestones.some((m) => m.status === "at_risk") ? "warn" as const : "pass" as const,
      message: plan.milestones.some((m) => m.status === "overdue")
        ? `${plan.milestones.filter((m) => m.status === "overdue").length} milestone(s) overdue`
        : plan.milestones.some((m) => m.status === "at_risk")
        ? `${plan.milestones.filter((m) => m.status === "at_risk").length} milestone(s) at risk`
        : "All milestones on track or completed",
    },
    {
      name: "Discriminators Identified",
      status: plan.discriminators.length >= 1 ? "pass" as const : "fail" as const,
      message: `${plan.discriminators.length} discriminator(s) identified`,
    },
  ];

  const passed = checks.filter((c) => c.status === "pass").length;
  const total = checks.length;
  const overallStatus = checks.some((c) => c.status === "fail")
    ? "blocked" : checks.some((c) => c.status === "warn") ? "conditional" : "approved";

  // Store gate review result in DB
  if (pool) {
    try {
      const gateReview = {
        gate,
        correlation_id: correlationId,
        overall_status: overallStatus,
        checks,
        passed,
        total,
        reviewed_at: new Date().toISOString(),
      };

      await pool.query(
        `UPDATE capture_plans
         SET gate_reviews = COALESCE(gate_reviews, '[]'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify([gateReview]), capture_plan_id],
      );
    } catch (err) {
      process.stderr.write(`[capture] gate-review store error: ${(err as Error).message}\n`);
    }
  }

  res.json(
    successEnvelope("GDA.capture", "gate-review", {
      capture_plan_id, opportunity_title: plan.opportunity_title,
      gate, correlationId, overallStatus, checks, passed, total,
    })
  );
});

export default router;
