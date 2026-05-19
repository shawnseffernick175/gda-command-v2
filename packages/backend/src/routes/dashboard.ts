import { Router } from "express";
import { log } from "../lib/logger";
import type { Opportunity, OpportunityStatus, CapturePlan } from "@gda/shared";
import { successEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";

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
        let topByScore = launchpad.topOpportunities.slice(0, 10);

        // Stage enforcement: recompute funnel with all n8n opps defaulting to Identified,
        // then overlay any user-approved stage overrides from the local DB.
        let n8nFunnel = funnel.oppStages.map((s) => ({
          stage: s.stage,
          count: s.count,
          totalValue: s.valueM * 1_000_000,
          avgPwin: 0,
          avgScore: 0,
        }));

        const pool = getPool();
        if (pool) {
          try {
            // Query per-stage aggregates from DB (canonical: exclude deleted)
            const statusAgg = await pool.query(
              `SELECT status, COUNT(*) as cnt,
                      COALESCE(SUM(value_estimated), 0) as total_value,
                      AVG(CASE WHEN probability_of_win IS NOT NULL THEN probability_of_win END) as avg_pwin,
                      AVG(score) as avg_score
               FROM v_opportunity_all_tracked WHERE id NOT LIKE 'opp-%' GROUP BY status`
            );
            const statusMap = new Map<string, { count: number; totalValue: number; avgPwin: number; avgScore: number }>();
            let dbTotal = 0;
            for (const row of statusAgg.rows) {
              const cnt = parseInt(row.cnt as string, 10);
              statusMap.set(row.status as string, {
                count: cnt,
                totalValue: parseFloat(row.total_value as string) || 0,
                avgPwin: parseFloat(row.avg_pwin as string) || 0,
                avgScore: parseFloat(row.avg_score as string) || 0,
              });
              dbTotal += cnt;
            }

            // Opps in n8n but not yet in DB are also in Identified
            const unsyncedCount = Math.max(0, totalOpportunities - dbTotal);
            const discoveryData = statusMap.get("discovery") ?? { count: 0, totalValue: 0, avgPwin: 0, avgScore: 0 };
            const discoveryCount = discoveryData.count + unsyncedCount;

            // Subtract non-discovery DB values from n8n total to avoid double-counting
            const nonDiscoveryValue = Array.from(statusMap.entries())
              .filter(([status]) => status !== "discovery")
              .reduce((s, [, d]) => s + d.totalValue, 0);
            const identifiedValue = Math.max(discoveryData.totalValue, totalPipelineValue - nonDiscoveryValue);

            const funnelMap = new Map<string, { count: number; totalValue: number; avgPwin: number; avgScore: number }>();
            funnelMap.set("Identified", { count: discoveryCount, totalValue: identifiedValue, avgPwin: discoveryData.avgPwin, avgScore: discoveryData.avgScore });
            for (const [status, data] of statusMap) {
              if (status === "discovery") continue;
              const label = status === "qualified" ? "Qualified" : status === "pipeline" ? "Pipeline" : status.charAt(0).toUpperCase() + status.slice(1);
              funnelMap.set(label, data);
            }
            n8nFunnel = Array.from(funnelMap.entries()).map(([stage, data]) => ({
              stage,
              count: data.count,
              totalValue: data.totalValue,
              avgPwin: data.avgPwin,
              avgScore: data.avgScore,
            }));
            // Augment top opps with DB data (dept, value, score, pwin)
            if (topByScore.length > 0) {
              const topIds = topByScore.map((o) => o.id);
              const dbTopResult = await pool.query(
                `SELECT id, department, value_estimated, score, probability_of_win
                 FROM opportunities WHERE id = ANY($1)`,
                [topIds]
              );
              const dbMap = new Map(
                dbTopResult.rows.map((r) => [
                  String(r.id),
                  {
                    department: r.department as string | null,
                    value_estimated: r.value_estimated ? parseFloat(r.value_estimated as string) : null,
                    score: parseFloat(r.score as string) || 0,
                    probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win as string) : null,
                  },
                ])
              );
              topByScore = topByScore.map((opp) => {
                const db = dbMap.get(opp.id);
                if (!db) return opp;
                return {
                  ...opp,
                  department: opp.department ?? db.department,
                  value_estimated: opp.value_estimated ?? db.value_estimated,
                  score: opp.score || db.score,
                  probability_of_win: opp.probability_of_win ?? db.probability_of_win,
                };
              });
              // Re-sort by score descending after augmentation
              topByScore.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            }

          } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
        }

        // If n8n topByScore is still empty/sparse, fall back to top DB opps
        if (topByScore.every((o) => !o.score)) {
          const pool2 = getPool();
          if (pool2) {
            try {
              const dbTop = await pool2.query(
                `SELECT id, title, agency, department, status, score, value_estimated,
                        probability_of_win, naics, psc, due_date, solicitation_number,
                        set_aside, place_of_performance, data_source, created_at, updated_at
                 FROM opportunities WHERE id NOT LIKE 'opp-%'
                 ORDER BY score DESC NULLS LAST LIMIT 10`
              );
              if (dbTop.rows.length > 0) {
                topByScore = dbTop.rows.map((r) => ({
                  id: String(r.id),
                  title: (r.title as string) ?? "Untitled",
                  agency: r.agency as string | null,
                  department: r.department as string | null,
                  status: ((r.status as string) ?? "discovery") as OpportunityStatus,
                  score: parseFloat(r.score as string) || 0,
                  value_estimated: r.value_estimated ? parseFloat(r.value_estimated as string) : null,
                  probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win as string) : null,
                  naics: r.naics as string | null,
                  psc: r.psc as string | null,
                  due_date: r.due_date as string | null,
                  solicitation_number: r.solicitation_number as string | null,
                  set_aside: r.set_aside as string | null,
                  place_of_performance: r.place_of_performance as string | null,
                  incumbent: null,
                  qualified_at: null,
                  qualified_by: null,
                  tags: [r.data_source as string].filter(Boolean),
                  raw_source_url: null,
                  data_source: r.data_source as string | null,
                  created_at: (r.created_at as string) ?? new Date().toISOString(),
                  updated_at: (r.updated_at as string) ?? new Date().toISOString(),
                }));
              }
            } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
          }
        }

        // Reconciled counts: query canonical views so Launchpad matches Opps Tracker
        let totalTracked = totalOpportunities;
        let activePipeline = totalOpportunities;
        let totalTrackedSource = "n8n" as string;
        if (pool) {
          try {
            const [trackedResult, activeResult] = await Promise.all([
              pool.query(`SELECT COUNT(*)::int AS cnt FROM v_opportunity_all_tracked`),
              pool.query(`SELECT COUNT(*)::int AS cnt FROM v_opportunity_active`),
            ]);
            totalTracked = trackedResult.rows[0]?.cnt ?? totalOpportunities;
            activePipeline = activeResult.rows[0]?.cnt ?? 0;
            totalTrackedSource = "canonical_view";
          } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
        }

        return res.json(
          successEnvelope(
            "gda-dashboard",
            "kpis",
            {
              totalOpportunities: totalTracked,
              activePipeline,
              totalPipelineValue,
              avgPwin: 0,
              avgScore,
              funnel: n8nFunnel,
              topByScore,
              source: "n8n" as const,
              countSource: totalTrackedSource,
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
              opportunityCount: totalTracked,
              pipelineCount: launchpad.kpis.pursueCount,
              viewLabel: "v_opportunity_all_tracked",
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
  let source: "db" = "db";

  if (pool) {
    try {
      const result = await pool.query(
        `SELECT id, title, agency, department, status, score, value_estimated,
                probability_of_win, naics, psc, due_date, solicitation_number,
                set_aside, place_of_performance, incumbent, qualified_at,
                qualified_by, tags, raw_source_url, data_source, created_at, updated_at
         FROM v_opportunity_all_tracked ORDER BY score DESC`
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
    } catch (err) {
      log.warn("dashboard_fallback", { error: String(err) });
      allOpps = [];
    }
  } else {
    allOpps = [];
  }

  // --- 3. Compute KPIs from local data (DB or mock) ---
  // Exclude fast-track signals from opportunity counts
  const realOpps = allOpps.filter((o) => (o as unknown as Record<string, unknown>).data_source !== "fast-track");
  const totalOpportunities = realOpps.length;

  // Pipeline Value = only Qualified + Pipeline status (approved items)
  const pipelineOpps = realOpps.filter((o) => o.status === "qualified" || o.status === "pipeline");
  const totalPipelineValue = pipelineOpps.reduce(
    (s, o) => s + (o.value_estimated ?? 0),
    0
  );

  const withPwin = realOpps.filter((o) => o.probability_of_win !== null);
  const avgPwin =
    withPwin.length > 0
      ? withPwin.reduce((s, o) => s + (o.probability_of_win ?? 0), 0) /
        withPwin.length
      : 0;

  const avgScore =
    totalOpportunities > 0
      ? realOpps.reduce((s, o) => s + o.score, 0) / totalOpportunities
      : 0;

  const funnel = STAGE_ORDER.map((stage) => {
    const stageOpps = realOpps.filter((o) => o.status === stage);
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

  const topByScore = [...realOpps].sort((a, b) => b.score - a.score).slice(0, 10);

  // Compute activePipeline from realOpps (active statuses only)
  const activeOpps = realOpps.filter((o) => o.status !== "won" && o.status !== "lost" && o.status !== "no_bid" && o.status !== "gov_cancelled");

  return res.json(
    successEnvelope(
      "gda-dashboard",
      "kpis",
      {
        totalOpportunities,
        activePipeline: activeOpps.length,
        totalPipelineValue,
        avgPwin,
        avgScore,
        funnel,
        topByScore,
        source,
        countSource: "canonical_view",
      },
      {
        generatedAt: new Date().toISOString(),
        opportunityCount: totalOpportunities,
        pipelineCount: pipelineOpps.length,
        viewLabel: "v_opportunity_all_tracked",
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
  let captureSource: "n8n" | "db" = "db";

  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchCapturePlansFromN8n();
      if (n8nResult.ok && n8nResult.plans.length > 0) {
        plans = n8nResult.plans;
        captureSource = "n8n";
      } else {
        plans = [];
      }
    } catch (err) {
      log.warn("dashboard_fallback", { error: String(err) });
      plans = [];
    }
  } else {
    plans = [];
  }

  // --- Active risks: pull from risk_register table first, fall back to capture plans ---
  let activeRisks: Array<Record<string, unknown>> = [];
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id, opportunity_id, opportunity_title, category, if_statement, then_statement,
                likelihood, impact, risk_score, status, mitigation_plan, mitigation_owner
         FROM risk_register WHERE status != 'closed' ORDER BY risk_score DESC LIMIT 8`,
      );
      activeRisks = rows.map((r) => ({
        risk_id: r.id,
        opportunity_id: r.opportunity_id,
        opportunity_title: r.opportunity_title,
        category: r.category,
        description: r.if_statement,
        likelihood: r.likelihood,
        impact: r.impact,
        risk_score: parseFloat(r.risk_score) || 0,
        mitigation: r.mitigation_plan,
        status: r.status,
      }));
    } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
  }
  if (activeRisks.length === 0) {
    activeRisks = plans
      .flatMap((p) =>
        p.risks
          .filter((r) => r.likelihood === "high" || r.impact === "high")
          .map((r) => ({
            plan_id: p.id,
            opportunity_id: p.opportunity_id,
            opportunity_title: p.opportunity_title,
            agency: p.agency,
            description: r.description,
            likelihood: r.likelihood,
            impact: r.impact,
            mitigation: r.mitigation,
          }))
      )
      .slice(0, 8);
  }

  // --- Upcoming decisions: pending bid decisions ---
  const upcomingDecisions = plans
    .filter((p) => p.bid_decision === "pending")
    .map((p) => {
      const nextMilestone = p.milestones
        .filter((m) => m.status !== "completed")
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
      return {
        plan_id: p.id,
        opportunity_id: p.opportunity_id,
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
          opportunity_id: p.opportunity_id,
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
    } catch (err) {
      log.warn("dashboard_fallback", { error: String(err) });
      // fall through to mock
    }
  }

  if (accelerators.length === 0) {
    accelerators = [
      { opportunity_title: "Army PEO IEW&S SETA Follow-on", signal: "RFP response window < 14 days — finalize pricing strategy vs. Leidos", urgency: "high" },
      { opportunity_title: "DEVCOM C5ISR Cyber IA Services", signal: "Sources Sought response due — highlight RMF and STIG expertise", urgency: "medium" },
      { opportunity_title: "Air Force Hanscom IT Modernization", signal: "Draft RFP posted — begin compliance matrix for SD-WAN + zero trust", urgency: "high" },
    ];
  }

  // --- Pending approvals count ---
  const pendingApprovals: Array<{ priority: string }> = [];
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

// ---------------------------------------------------------------------------
// GET /api/dashboard/mega — Combined live data from n8n dashboard-mega webhook
// Returns funnel, risks, stats, trends, contracts, opps, and sitrep
// ---------------------------------------------------------------------------
router.get("/mega", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const { callWebhook } = await import("../lib/n8n-client");
      const result = await callWebhook("gda-dashboard-mega", {}, { timeoutMs: 30_000 });
      if (result.ok && result.body) {
        const data = result.body as Record<string, unknown>;
        return res.json(
          successEnvelope("gda-dashboard", "mega", {
            ...data,
            source: "n8n",
          }, {
            generatedAt: new Date().toISOString(),
            webhookMs: result.ms,
          })
        );
      }
    } catch (err: unknown) {
      process.stderr.write(`[dashboard] mega n8n error: ${(err as Error).message}\n`);
    }
  }

  // Fallback: compose from DB/mock
  const pool = getPool();
  let oppCount = 0;
  let pipelineValue = 0;

  if (pool) {
    try {
      const { rows: countRow } = await pool.query("SELECT COUNT(*) as c FROM opportunities");
      oppCount = parseInt(countRow[0].c, 10);
      const { rows: valRow } = await pool.query(
        "SELECT COALESCE(SUM(value_estimated), 0) as v FROM opportunities WHERE status = 'pipeline'"
      );
      pipelineValue = parseFloat(valRow[0].v) || 0;
    } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
  }

  res.json(
    successEnvelope("gda-dashboard", "mega", {
      status: "ok",
      funnel: [],
      risks: [],
      stats: { totalOpps: oppCount, pipelineValue },
      trends: [],
      contracts: [],
      opps: [],
      sitrep: null,
      source: "db",
    }, {
      generatedAt: new Date().toISOString(),
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/trends — Live trend metrics from n8n
// ---------------------------------------------------------------------------
router.get("/trends", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const { callWebhook } = await import("../lib/n8n-client");
      const result = await callWebhook("gda-trends", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const data = result.body as Record<string, unknown>;
        return res.json(
          successEnvelope("gda-dashboard", "trends", {
            ...(data.data ? { trends: data.data, count: data.count } : data),
            source: "n8n",
          })
        );
      }
    } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
  }

  res.json(
    successEnvelope("gda-dashboard", "trends", {
      trends: [],
      count: 0,
      source: "db",
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/actions — Daily action items from n8n
// ---------------------------------------------------------------------------
router.get("/actions", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const { callWebhook } = await import("../lib/n8n-client");
      const result = await callWebhook("gda-daily-actions", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(
          successEnvelope("gda-dashboard", "actions", {
            actions: Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).actions ?? [],
            source: "n8n",
          })
        );
      }
    } catch (err) { log.warn("dashboard_fallback", { error: String(err) }); }
  }

  res.json(
    successEnvelope("gda-dashboard", "actions", {
      actions: [],
      source: "db",
    })
  );
});

export default router;
