import { Router } from "express";
import { successEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import type { GovWinOpportunity } from "@gda/shared";

const router = Router();

// GET /api/govwin/summary
router.get("/summary", async (_req, res) => {
  const pool = getPool();
  let all: GovWinOpportunity[] = [];
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM govwin_opportunities ORDER BY last_updated DESC");
      all = rows as GovWinOpportunity[];
    } catch { /* empty */ }
  }

  const activeOpps = all.filter((o) => o.status !== "dismissed" && o.status !== "archived");
  const totalValue = activeOpps.reduce((s, o) => s + ((o.value_low ?? 0) + (o.value_high ?? 0)) / 2, 0);

  res.json(
    successEnvelope("GDA.govwin", "summary", {
      total: all.length,
      new_count: all.filter((o) => o.status === "new").length,
      tracking_count: all.filter((o) => o.status === "tracking").length,
      qualified_count: all.filter((o) => o.status === "qualified").length,
      dismissed_count: all.filter((o) => o.status === "dismissed").length,
      avg_relevance: all.length > 0 ? Math.round(all.reduce((s, o) => s + o.relevance_score, 0) / all.length) : 0,
      total_pipeline_value: totalValue,
      last_sync: null,
      source: "db" as const,
    })
  );
});

// GET /api/govwin/opportunities
router.get("/opportunities", async (req, res) => {
  const { search, status, stage, sort } = req.query;
  const pool = getPool();
  let results: GovWinOpportunity[] = [];
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM govwin_opportunities ORDER BY last_updated DESC");
      results = rows as GovWinOpportunity[];
    } catch { /* empty */ }
  }

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
router.get("/opportunities/:id", async (req, res) => {
  const pool = getPool();
  let opp: GovWinOpportunity | undefined;
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM govwin_opportunities WHERE id = $1", [req.params.id]);
      if (rows.length > 0) opp = rows[0] as GovWinOpportunity;
    } catch { /* empty */ }
  }
  if (!opp) {
    res.status(404).json(successEnvelope("GDA.govwin", "opportunity-detail", null));
    return;
  }
  res.json(successEnvelope("GDA.govwin", "opportunity-detail", opp));
});

// GET /api/govwin/syncs
router.get("/syncs", async (_req, res) => {
  const pool = getPool();
  let syncs: unknown[] = [];
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM govwin_syncs ORDER BY started_at DESC LIMIT 20");
      syncs = rows;
    } catch { /* empty */ }
  }
  res.json(successEnvelope("GDA.govwin", "syncs", syncs));
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
  res.status(404).json(successEnvelope("GDA.govwin", "update-status", null));
});

// POST /api/govwin/opportunities/:id/promote
router.post("/opportunities/:id/promote", (req, res) => {
  res.status(404).json(successEnvelope("GDA.govwin", "promote", null));
});

export default router;
