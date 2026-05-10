import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import {
  MOCK_CAPTURE_PLANS,
  MOCK_CAPTURE_ACTIVITIES,
} from "../data/capture-mock";
const router = Router();

// ---------------------------------------------------------------------------
// GET /api/capture/plans — list capture plans with filtering
// ---------------------------------------------------------------------------
router.get("/plans", (_req, res) => {
  const {
    phase,
    bid_decision,
    search,
    sortBy = "updated_at",
    sortDir = "desc",
  } = _req.query as Record<string, string | undefined>;

  let plans = [...MOCK_CAPTURE_PLANS];

  if (phase) {
    plans = plans.filter((p) => p.phase === phase);
  }
  if (bid_decision) {
    plans = plans.filter((p) => p.bid_decision === bid_decision);
  }
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

  // Compute summary stats
  const totalValue = MOCK_CAPTURE_PLANS.reduce((s, p) => s + p.value_estimated, 0);
  const avgPwin = Math.round(
    MOCK_CAPTURE_PLANS.reduce((s, p) => s + p.pwin, 0) / MOCK_CAPTURE_PLANS.length
  );
  const phases: Record<string, number> = {};
  for (const p of MOCK_CAPTURE_PLANS) {
    phases[p.phase] = (phases[p.phase] || 0) + 1;
  }
  const decisions: Record<string, number> = {};
  for (const p of MOCK_CAPTURE_PLANS) {
    decisions[p.bid_decision] = (decisions[p.bid_decision] || 0) + 1;
  }

  const allMilestones = MOCK_CAPTURE_PLANS.flatMap((p) => p.milestones);
  const atRiskCount = allMilestones.filter((m) => m.status === "at_risk" || m.status === "overdue").length;
  const upcomingMilestones = allMilestones
    .filter((m) => m.status !== "completed")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  res.json(
    successEnvelope("GDA.capture", "list-plans", {
      plans,
      total: MOCK_CAPTURE_PLANS.length,
      filtered: plans.length,
      totalValue,
      avgPwin,
      phases,
      decisions,
      atRiskMilestones: atRiskCount,
      upcomingMilestones,
      source: "mock",
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/capture/plans/:id — single capture plan detail
// ---------------------------------------------------------------------------
router.get("/plans/:id", (req, res) => {
  const plan = MOCK_CAPTURE_PLANS.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json(
      errorEnvelope("GDA.capture", "plan-detail", {
        code: "NOT_FOUND",
        message: "Capture plan not found",
        detail: null,
      })
    );
    return;
  }

  const activities = MOCK_CAPTURE_ACTIVITIES.filter(
    (a) => a.capture_plan_id === plan.id
  ).sort(
    (a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
  );

  res.json(
    successEnvelope("GDA.capture", "plan-detail", {
      plan,
      activities,
      source: "mock",
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/capture/activities — BD activity log across all captures
// ---------------------------------------------------------------------------
router.get("/activities", (_req, res) => {
  const { type, search, limit = "20" } = _req.query as Record<string, string | undefined>;

  let activities = [...MOCK_CAPTURE_ACTIVITIES];

  if (type) {
    activities = activities.filter((a) => a.activity_type === type);
  }
  if (search) {
    const q = search.toLowerCase();
    activities = activities.filter(
      (a) =>
        a.description.toLowerCase().includes(q) ||
        a.opportunity_title.toLowerCase().includes(q) ||
        a.performed_by.toLowerCase().includes(q)
    );
  }

  activities.sort(
    (a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
  );

  const typeCounts: Record<string, number> = {};
  for (const a of MOCK_CAPTURE_ACTIVITIES) {
    typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
  }

  const limited = activities.slice(0, parseInt(limit, 10));

  res.json(
    successEnvelope("GDA.capture", "activities", {
      activities: limited,
      total: MOCK_CAPTURE_ACTIVITIES.length,
      filtered: activities.length,
      returned: limited.length,
      typeCounts,
      source: "mock",
    })
  );
});

// ---------------------------------------------------------------------------
// POST /api/capture/gate-review — trigger gate review (dry-run)
// ---------------------------------------------------------------------------
router.post("/gate-review", (req, res) => {
  const { capture_plan_id, gate } = req.body as {
    capture_plan_id?: string;
    gate?: string;
  };

  if (!capture_plan_id || !gate) {
    res.status(400).json(
      errorEnvelope("GDA.capture", "gate-review", {
        code: "BAD_REQUEST",
        message: "capture_plan_id and gate are required",
        detail: null,
      })
    );
    return;
  }

  const plan = MOCK_CAPTURE_PLANS.find((p) => p.id === capture_plan_id);
  if (!plan) {
    res.status(404).json(
      errorEnvelope("GDA.capture", "gate-review", {
        code: "NOT_FOUND",
        message: "Capture plan not found",
        detail: null,
      })
    );
    return;
  }

  const correlationId = `GDA-GATE-${Date.now().toString(36).toUpperCase()}`;

  const checks = [
    {
      name: "Teaming Partners Confirmed",
      status: plan.teaming_partners.every((t) => t.status === "confirmed")
        ? "pass" as const
        : "warn" as const,
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
      status: plan.risks.every((r) => r.mitigation.length > 0)
        ? "pass" as const
        : "fail" as const,
      message: plan.risks.every((r) => r.mitigation.length > 0)
        ? "All risks have mitigation plans"
        : "Some risks lack mitigation strategies",
    },
    {
      name: "Milestones On Track",
      status: plan.milestones.some((m) => m.status === "overdue")
        ? "fail" as const
        : plan.milestones.some((m) => m.status === "at_risk")
        ? "warn" as const
        : "pass" as const,
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
    ? "blocked"
    : checks.some((c) => c.status === "warn")
    ? "conditional"
    : "approved";

  res.json(
    successEnvelope(
      "GDA.capture",
      "gate-review",
      {
        capture_plan_id,
        opportunity_title: plan.opportunity_title,
        gate,
        correlationId,
        overallStatus,
        checks,
        passed,
        total,
      },
      {},
      true
    )
  );
});

export default router;
