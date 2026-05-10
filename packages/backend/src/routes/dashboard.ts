import { Router } from "express";
import type { Opportunity, OpportunityStatus, CapturePlan } from "@gda/shared";
import { successEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { getMockOpportunities } from "../data/opportunities-mock";
import {
  MOCK_CAPTURE_PLANS,
} from "../data/capture-mock";
import { MOCK_APPROVALS } from "../data/approvals-mock";
import {
  n8nWebhookConfigured,
  fetchLaunchpadFromN8n,
  fetchLaunchpadFunnelFromN8n,
  fetchCapturePlansFromN8n,
} from "../lib/n8n-data";

const router = Router();

const STAGE_ORDER: OpportunityStatus[] = [
  "discovery",
  "qualified",
  "pipeline",
  "won",
  "lost",
];

// ---------------------------------------------------------------------------
// GET /api/dashboard/kpis — Launchpad KPIs, funnel, and top opportunities
// ---------------------------------------------------------------------------
router.get("/kpis", async (_req, res) => {
  // --- 1. Try n8n launchpad + funnel endpoints ---
  if (n8nWebhookConfigured()) {
    try {
      const [launchpad, funnel] = await Promise.all([
        fetchLaunchpadFromN8n(),
        fetchLaunchpadFunnelFromN8n(),
      ]);

      if (launchpad.ok && funnel.ok) {
        const totalOpportunities = funnel.summary.totalOpps || launchpad.kpis.totalOpps;
        const totalPipelineValue = launchpad.kpis.weightedPipelineRaw;

        const avgScore = launchpad.kpis.avgScore;
        const topByScore = launchpad.topOpportunities.slice(0, 10);

        const n8nFunnel = funnel.oppStages.map((s) => ({
          stage: s.stage,
          count: s.count,
          totalValue: s.valueM * 1_000_000,
          avgPwin: 0,
          avgScore: 0,
        }));

        return res.json(
          successEnvelope(
            "gda-dashboard",
            "kpis",
            {
              totalOpportunities,
              totalPipelineValue,
              avgPwin: 0,
              avgScore,
              funnel: n8nFunnel,
              topByScore,
              source: "n8n" as const,
              n8nKpis: {
                pursueCount: launchpad.kpis.pursueCount,
                evaluateCount: launchpad.kpis.evaluateCount,
                monitorCount: launchpad.kpis.monitorCount,
                weightedPipeline: launchpad.kpis.weightedPipeline,
              },
              captureStages: funnel.captureStages,
              analysisStatus: launchpad.analysisStatus,
              ftSignals: launchpad.ftSignals,
            },
            {
              generatedAt: launchpad.generatedAt || new Date().toISOString(),
              opportunityCount: totalOpportunities,
              pipelineCount: launchpad.kpis.pursueCount,
            }
          )
        );
      }
    } catch (err: unknown) {
      process.stderr.write(`[dashboard] n8n fallback: ${(err as Error).message}\n`);
    }
  }

  // --- 2. Try Postgres ---
  const pool = getPool();

  let allOpps: Opportunity[];
  let source: "mock" | "db" = "mock";

  if (pool) {
    try {
      const result = await pool.query(
        `SELECT id, title, agency, department, status, score, value_estimated,
                probability_of_win, naics, psc, due_date, solicitation_number,
                set_aside, place_of_performance, incumbent, qualified_at,
                qualified_by, tags, raw_source_url, created_at, updated_at
         FROM opportunities ORDER BY score DESC`
      );
      allOpps = result.rows.map((r) => ({
        ...r,
        score: parseFloat(r.score) || 0,
        value_estimated: r.value_estimated ? parseFloat(r.value_estimated) : null,
        probability_of_win: r.probability_of_win
          ? parseFloat(r.probability_of_win)
          : null,
      }));
      source = "db";
    } catch {
      allOpps = getMockOpportunities();
    }
  } else {
    allOpps = getMockOpportunities();
  }

  // --- 3. Compute KPIs from local data (DB or mock) ---
  const totalOpportunities = allOpps.length;

  const pipelineOpps = allOpps.filter((o) => o.status === "pipeline");
  const totalPipelineValue = pipelineOpps.reduce(
    (s, o) => s + (o.value_estimated ?? 0),
    0
  );

  const withPwin = allOpps.filter((o) => o.probability_of_win !== null);
  const avgPwin =
    withPwin.length > 0
      ? withPwin.reduce((s, o) => s + (o.probability_of_win ?? 0), 0) /
        withPwin.length
      : 0;

  const avgScore =
    totalOpportunities > 0
      ? allOpps.reduce((s, o) => s + o.score, 0) / totalOpportunities
      : 0;

  const funnel = STAGE_ORDER.map((stage) => {
    const stageOpps = allOpps.filter((o) => o.status === stage);
    const count = stageOpps.length;
    const totalValue = stageOpps.reduce(
      (s, o) => s + (o.value_estimated ?? 0),
      0
    );
    const stageWithPwin = stageOpps.filter(
      (o) => o.probability_of_win !== null
    );
    const stageAvgPwin =
      stageWithPwin.length > 0
        ? stageWithPwin.reduce((s, o) => s + (o.probability_of_win ?? 0), 0) /
          stageWithPwin.length
        : 0;
    const stageAvgScore =
      count > 0
        ? stageOpps.reduce((s, o) => s + o.score, 0) / count
        : 0;

    return {
      stage,
      count,
      totalValue,
      avgPwin: stageAvgPwin,
      avgScore: stageAvgScore,
    };
  });

  const topByScore = [...allOpps].sort((a, b) => b.score - a.score).slice(0, 10);

  return res.json(
    successEnvelope(
      "gda-dashboard",
      "kpis",
      {
        totalOpportunities,
        totalPipelineValue,
        avgPwin,
        avgScore,
        funnel,
        topByScore,
        source,
      },
      {
        generatedAt: new Date().toISOString(),
        opportunityCount: totalOpportunities,
        pipelineCount: pipelineOpps.length,
      }
    )
  );
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/command-signals — aggregated risks, decisions, due-soon,
// accelerators, and pending approvals for the Launchpad
// ---------------------------------------------------------------------------
router.get("/command-signals", async (_req, res) => {
  // --- Capture plans (try n8n first, then mock) ---
  let plans: CapturePlan[];
  let captureSource: "n8n" | "mock" = "mock";

  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchCapturePlansFromN8n();
      if (n8nResult.ok && n8nResult.plans.length > 0) {
        plans = n8nResult.plans;
        captureSource = "n8n";
      } else {
        plans = MOCK_CAPTURE_PLANS;
      }
    } catch {
      plans = MOCK_CAPTURE_PLANS;
    }
  } else {
    plans = MOCK_CAPTURE_PLANS;
  }

  // --- Active risks: high likelihood or high impact ---
  const activeRisks = plans
    .flatMap((p) =>
      p.risks
        .filter((r) => r.likelihood === "high" || r.impact === "high")
        .map((r) => ({
          plan_id: p.id,
          opportunity_title: p.opportunity_title,
          agency: p.agency,
          description: r.description,
          likelihood: r.likelihood,
          impact: r.impact,
          mitigation: r.mitigation,
        }))
    )
    .slice(0, 8);

  // --- Upcoming decisions: pending bid decisions ---
  const upcomingDecisions = plans
    .filter((p) => p.bid_decision === "pending")
    .map((p) => {
      const nextMilestone = p.milestones
        .filter((m) => m.status !== "completed")
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
      return {
        plan_id: p.id,
        opportunity_title: p.opportunity_title,
        agency: p.agency,
        phase: p.phase,
        pwin: p.pwin,
        value_estimated: p.value_estimated,
        next_deadline: nextMilestone?.due_date ?? null,
        next_milestone: nextMilestone?.title ?? null,
      };
    })
    .slice(0, 6);

  // --- Due-soon items: at-risk/overdue milestones + milestones due within 30 days ---
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const dueSoonItems = plans
    .flatMap((p) =>
      p.milestones
        .filter((m) => {
          if (m.status === "at_risk" || m.status === "overdue") return true;
          if (m.status === "completed") return false;
          const due = new Date(m.due_date).getTime();
          return due > 0 && due - now < thirtyDays && due - now > 0;
        })
        .map((m) => ({
          plan_id: p.id,
          opportunity_title: p.opportunity_title,
          milestone_id: m.id,
          title: m.title,
          due_date: m.due_date,
          status: m.status,
          owner: m.owner,
        }))
    )
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 8);

  // --- Accelerators (from n8n if available) ---
  let accelerators: Array<{
    opportunity_title: string;
    signal: string;
    urgency: "high" | "medium" | "low";
  }> = [];

  if (n8nWebhookConfigured()) {
    try {
      const lp = await fetchLaunchpadFromN8n();
      if (lp.ok && Array.isArray(lp.ftSignals) && lp.ftSignals.length > 0) {
        accelerators = (lp.ftSignals as Array<Record<string, unknown>>).map((s) => ({
          opportunity_title: (s.opportunity_title ?? s.title ?? "Unknown") as string,
          signal: (s.signal ?? s.description ?? s.message ?? "Accelerate action required") as string,
          urgency: (s.urgency ?? "medium") as "high" | "medium" | "low",
        }));
      }
    } catch {
      // fall through to mock
    }
  }

  if (accelerators.length === 0) {
    accelerators = [
      { opportunity_title: "USACE FUDS IDIQ TO-3", signal: "RFP response window < 14 days — accelerate draft", urgency: "high" },
      { opportunity_title: "NASA KSC Launch Ops", signal: "Incumbent contract expiring Q3 — early engagement window", urgency: "medium" },
      { opportunity_title: "DHA MHS GENESIS Phase 4", signal: "Draft RFP posted — begin compliance matrix", urgency: "high" },
    ];
  }

  // --- Pending approvals count ---
  const pendingApprovals = MOCK_APPROVALS.filter((a) => a.status === "pending");
  const criticalApprovals = pendingApprovals.filter((a) => a.priority === "critical");

  return res.json(
    successEnvelope(
      "gda-dashboard",
      "command-signals",
      {
        activeRisks,
        upcomingDecisions,
        dueSoonItems,
        accelerators,
        approvalsSummary: {
          pending: pendingApprovals.length,
          critical: criticalApprovals.length,
        },
        captureSource,
      },
      {
        generatedAt: new Date().toISOString(),
        totalPlans: plans.length,
      }
    )
  );
});

export default router;
