import { Router } from "express";
import { successEnvelope } from "../middleware/envelope";
import { MOCK_GOVWIN_OPPORTUNITIES, MOCK_GOVWIN_SYNCS } from "../data/govwin-mock";
import type { GovWinOpportunity } from "@gda/shared";

const router = Router();

// GET /api/govwin/summary
router.get("/summary", (_req, res) => {
  const all = MOCK_GOVWIN_OPPORTUNITIES;
  const activeOpps = all.filter((o) => o.status !== "dismissed" && o.status !== "archived");
  const totalValue = activeOpps.reduce((s, o) => s + ((o.value_low ?? 0) + (o.value_high ?? 0)) / 2, 0);
  const lastSync = MOCK_GOVWIN_SYNCS.find((s) => s.status === "completed");

  res.json(
    successEnvelope("GDA.govwin", "summary", {
      total: all.length,
      new_count: all.filter((o) => o.status === "new").length,
      tracking_count: all.filter((o) => o.status === "tracking").length,
      qualified_count: all.filter((o) => o.status === "qualified").length,
      dismissed_count: all.filter((o) => o.status === "dismissed").length,
      avg_relevance: Math.round(all.reduce((s, o) => s + o.relevance_score, 0) / all.length),
      total_pipeline_value: totalValue,
      last_sync: lastSync?.completed_at ?? null,
      source: "mock" as const,
    })
  );
});

// GET /api/govwin/opportunities
router.get("/opportunities", (req, res) => {
  const { search, status, stage, sort } = req.query;
  let results: GovWinOpportunity[] = [...MOCK_GOVWIN_OPPORTUNITIES];

  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    results = results.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        o.agency.toLowerCase().includes(q) ||
        o.naics.includes(q) ||
        o.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (status && typeof status === "string") {
    results = results.filter((o) => o.status === status);
  }

  if (stage && typeof stage === "string") {
    results = results.filter((o) => o.stage.toLowerCase() === stage.toLowerCase());
  }

  if (sort === "relevance") {
    results.sort((a, b) => b.relevance_score - a.relevance_score);
  } else if (sort === "value") {
    results.sort((a, b) => ((b.value_high ?? 0) - (a.value_high ?? 0)));
  } else if (sort === "date") {
    results.sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());
  }

  res.json(successEnvelope("GDA.govwin", "opportunities", results));
});

// GET /api/govwin/opportunities/:id
router.get("/opportunities/:id", (req, res) => {
  const opp = MOCK_GOVWIN_OPPORTUNITIES.find((o) => o.id === req.params.id);
  if (!opp) {
    res.status(404).json(successEnvelope("GDA.govwin", "opportunity-detail", null));
    return;
  }
  res.json(successEnvelope("GDA.govwin", "opportunity-detail", opp));
});

// GET /api/govwin/syncs
router.get("/syncs", (_req, res) => {
  res.json(successEnvelope("GDA.govwin", "syncs", MOCK_GOVWIN_SYNCS));
});

// POST /api/govwin/sync (trigger manual sync)
router.post("/sync", (_req, res) => {
  res.json(
    successEnvelope("GDA.govwin", "sync-triggered", {
      id: `gs-${Date.now()}`,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: "running" as const,
      opportunities_synced: 0,
      new_matches: 0,
      error: null,
    })
  );
});

// POST /api/govwin/opportunities/:id/status
router.post("/opportunities/:id/status", (req, res) => {
  const opp = MOCK_GOVWIN_OPPORTUNITIES.find((o) => o.id === req.params.id);
  if (!opp) {
    res.status(404).json(successEnvelope("GDA.govwin", "update-status", null));
    return;
  }
  const { status } = req.body ?? {};
  res.json(
    successEnvelope("GDA.govwin", "update-status", { ...opp, status: status ?? opp.status })
  );
});

// POST /api/govwin/opportunities/:id/promote
router.post("/opportunities/:id/promote", (req, res) => {
  const opp = MOCK_GOVWIN_OPPORTUNITIES.find((o) => o.id === req.params.id);
  if (!opp) {
    res.status(404).json(successEnvelope("GDA.govwin", "promote", null));
    return;
  }
  res.json(
    successEnvelope("GDA.govwin", "promote", {
      govwin_opportunity: opp,
      promoted_to: "opportunity",
      new_opportunity_id: `opp-gw-${Date.now()}`,
    })
  );
});

export default router;
