import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_FPDS_AWARDS } from "../data/fpds-mock";
import { getPool } from "../lib/db";
import type { FPDSAward } from "../data/fpds-mock";

const router = Router();

async function loadAwards(): Promise<{ items: FPDSAward[]; source: "db" | "mock" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM fpds_awards ORDER BY award_date DESC");
      if (rows.length > 0) return { items: rows as FPDSAward[], source: "db" };
    } catch { /* fall through */ }
  }
  return { items: [...MOCK_FPDS_AWARDS], source: "mock" };
}

router.get("/summary", async (_req, res) => {
  try {
    const { items: all, source } = await loadAwards();
    const totalValue = all.reduce((s, a) => s + (a.award_amount ?? 0), 0);
    const competitorAwards = all.filter((a) => a.is_competitor).length;
    const uniqueCompetitors = new Set(all.filter((a) => a.competitor_name).map((a) => a.competitor_name)).size;
    const recompeteCandidates = all.filter((a) => a.is_recompete_candidate).length;
    const avgRelevance = all.length > 0 ? Math.round(all.reduce((s, a) => s + (a.relevance_score ?? 0), 0) / all.length) : 0;

    return res.json(
      successEnvelope("gda-fpds", "summary", {
        total_awards: all.length, total_value: totalValue,
        competitor_awards: competitorAwards, unique_competitors: uniqueCompetitors,
        recompete_candidates: recompeteCandidates, avg_relevance: avgRelevance, source,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fpds", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/awards", async (req, res) => {
  try {
    const { items: all, source } = await loadAwards();
    let items = [...all];
    const { competitor, recompete, award_type, competition_type, search } = req.query;

    if (competitor && typeof competitor === "string") items = items.filter((a) => a.is_competitor === (competitor === "true"));
    if (recompete && typeof recompete === "string") items = items.filter((a) => a.is_recompete_candidate === (recompete === "true"));
    if (award_type && typeof award_type === "string") items = items.filter((a) => a.award_type === award_type);
    if (competition_type && typeof competition_type === "string") items = items.filter((a) => a.competition_type === competition_type);
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.agency.toLowerCase().includes(q) ||
        a.vendor.toLowerCase().includes(q) ||
        a.piid.toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => new Date(b.award_date).getTime() - new Date(a.award_date).getTime());

    return res.json(
      successEnvelope("gda-fpds", "list", items, { total: items.length, source }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fpds", "list", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/awards/:id", async (req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM fpds_awards WHERE id = $1", [req.params.id]);
      if (rows.length > 0) return res.json(successEnvelope("gda-fpds", "detail", rows[0]));
    } catch { /* fall through */ }
  }
  const item = MOCK_FPDS_AWARDS.find((a) => a.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-fpds", "detail", { code: "NOT_FOUND", message: `FPDS award ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-fpds", "detail", item));
});

export default router;
