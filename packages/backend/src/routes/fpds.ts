import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";

interface FPDSAward { id: string; award_amount?: number; is_competitor?: boolean; competitor_name?: string; is_recompete_candidate?: boolean; relevance_score?: number; [key: string]: unknown }

const router = Router();

async function loadAwards(): Promise<{ items: FPDSAward[]; source: "db" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM fpds_awards ORDER BY award_date DESC");
      if (rows.length > 0) return { items: rows as FPDSAward[], source: "db" };
    } catch { /* fall through */ }
  }
  return { items: [], source: "db" };
}

router.get("/summary", async (_req, res) => {
  try {
    const { items: all, source } = await loadAwards();
    const totalValue = all.reduce((s, a) => s + (Number(a.award_amount) || 0), 0);
    const competitorAwards = all.filter((a) => a.is_competitor).length;
    const uniqueCompetitors = new Set(all.filter((a) => a.competitor_name).map((a) => a.competitor_name)).size;
    const recompeteCandidates = all.filter((a) => a.is_recompete_candidate).length;
    const avgRelevance = all.length > 0 ? Math.round(all.reduce((s, a) => s + (Number(a.relevance_score) || 0), 0) / all.length) : 0;

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
        String(a.title ?? "").toLowerCase().includes(q) ||
        String(a.agency ?? "").toLowerCase().includes(q) ||
        String(a.vendor ?? "").toLowerCase().includes(q) ||
        String(a.piid ?? "").toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => new Date(String(b.award_date)).getTime() - new Date(String(a.award_date)).getTime());

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
  const item: FPDSAward | undefined = undefined;
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-fpds", "detail", { code: "NOT_FOUND", message: `FPDS award ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-fpds", "detail", item));
});

// ---------------------------------------------------------------------------
// POST /api/fpds/analyze-competitors — cross-reference awards against tracked competitors
// ---------------------------------------------------------------------------
router.post("/analyze-competitors", requireRole("admin", "bd_manager"), async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-fpds", "analyze-competitors", { code: "NO_DB", message: "Database unavailable", detail: null }));
  }

  try {
    // Get tracked competitors from intel competitor_watch
    const { rows: competitors } = await pool.query(
      "SELECT id, name FROM competitor_profiles WHERE deleted_at IS NULL"
    ).catch(() => ({ rows: [] as { id: string; name: string }[] }));

    const competitorNames = competitors.map((c) => c.name.toLowerCase());

    // Update FPDS awards with competitor match data
    const { rows: awards } = await pool.query(
      "SELECT id, vendor, naics, award_date, period_of_performance_end FROM fpds_awards WHERE is_competitor IS NULL OR is_competitor = false"
    );

    let matched = 0;
    let recompete = 0;

    for (const award of awards) {
      const vendorLower = (award.vendor ?? "").toLowerCase();
      const competitorIdx = vendorLower.length > 0
        ? competitorNames.findIndex((c) => vendorLower.includes(c) || c.includes(vendorLower))
        : -1;
      const isCompetitor = competitorIdx >= 0;

      // Check if contract is ending soon (within 12 months) → recompete candidate
      const periodEnd = award.period_of_performance_end ? new Date(award.period_of_performance_end) : null;
      const twelveMonths = new Date();
      twelveMonths.setMonth(twelveMonths.getMonth() + 12);
      const isRecompete = periodEnd !== null && periodEnd <= twelveMonths && periodEnd > new Date();

      await pool.query(
        `UPDATE fpds_awards SET
          is_competitor = $2,
          competitor_name = $3,
          is_recompete_candidate = $4
         WHERE id = $1`,
        [
          award.id,
          isCompetitor,
          isCompetitor ? competitors[competitorIdx].name : null,
          isRecompete,
        ]
      );

      if (isCompetitor) matched++;
      if (isRecompete) recompete++;
    }

    return res.json(successEnvelope("gda-fpds", "analyze-competitors", {
      analyzed: awards.length,
      competitor_matches: matched,
      recompete_candidates: recompete,
      tracked_competitors: competitors.length,
      message: `Analyzed ${awards.length} awards: ${matched} competitor matches, ${recompete} recompete candidates`,
    }));
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fpds", "analyze-competitors", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

export default router;
