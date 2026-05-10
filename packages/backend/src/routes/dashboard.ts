import { Router } from "express";
import type { Opportunity, OpportunityStatus } from "@gda/shared";
import { successEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { getMockOpportunities } from "../data/opportunities-mock";

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

  const topByScore = [...allOpps].sort((a, b) => b.score - a.score).slice(0, 5);

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

export default router;
