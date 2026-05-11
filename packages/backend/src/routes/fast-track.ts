import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_FAST_TRACK_MATCHES } from "../data/fast-track-mock";
import type { FastTrackMatch } from "../data/fast-track-mock";
import { getPool } from "../lib/db";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/fast-track/summary — top-line summary cards
// ---------------------------------------------------------------------------
router.get("/summary", (_req, res) => {
  try {
    const all = MOCK_FAST_TRACK_MATCHES;
    const newCount = all.filter((m) => m.status === "new").length;
    const reviewingCount = all.filter((m) => m.status === "reviewing").length;
    const watchingCount = all.filter((m) => m.status === "watching").length;
    const promotedCount = all.filter((m) => m.status === "promoted").length;
    const discardedCount = all.filter((m) => m.status === "discarded").length;
    const needsAttentionCount = all.filter(
      (m) => m.status === "new" || (m.status === "reviewing" && m.match_score >= 75),
    ).length;

    return res.json(
      successEnvelope("gda-fast-track", "summary", {
        new_count: newCount,
        reviewing_count: reviewingCount,
        watching_count: watchingCount,
        promoted_count: promotedCount,
        discarded_count: discardedCount,
        needs_attention_count: needsAttentionCount,
        total_count: all.length,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/fast-track/matches — list view with filters
// ---------------------------------------------------------------------------
router.get("/matches", (req, res) => {
  try {
    let items: FastTrackMatch[] = [...MOCK_FAST_TRACK_MATCHES];
    const { status, signal_type, technology, company_role, min_match_score, search } = req.query;

    if (status && typeof status === "string") {
      items = items.filter((m) => m.status === status);
    }
    if (signal_type && typeof signal_type === "string") {
      items = items.filter((m) => m.signal_type === signal_type);
    }
    if (technology && typeof technology === "string") {
      const q = technology.toLowerCase();
      items = items.filter((m) => m.technology.toLowerCase().includes(q));
    }
    if (company_role && typeof company_role === "string") {
      items = items.filter((m) => m.company_role === company_role);
    }
    if (min_match_score && typeof min_match_score === "string") {
      const minScore = parseInt(min_match_score, 10);
      if (!isNaN(minScore)) {
        items = items.filter((m) => m.match_score >= minScore);
      }
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          m.signal_summary.toLowerCase().includes(q) ||
          m.technology.toLowerCase().includes(q) ||
          m.company_name.toLowerCase().includes(q) ||
          (m.candidate_agency && m.candidate_agency.toLowerCase().includes(q)) ||
          (m.candidate_requirement && m.candidate_requirement.toLowerCase().includes(q)),
      );
    }

    // Sort by match_score descending
    items.sort((a, b) => b.match_score - a.match_score);

    // Strip detail-only fields for list view
    const listItems = items.map(({ analysis, ooda, learning, ...rest }) => rest);

    return res.json(
      successEnvelope("gda-fast-track", "list", {
        matches: listItems,
        meta: {
          count: listItems.length,
          filtersApplied: {
            ...(status ? { status } : {}),
            ...(signal_type ? { signal_type } : {}),
            ...(technology ? { technology } : {}),
            ...(company_role ? { company_role } : {}),
            ...(min_match_score ? { min_match_score } : {}),
            ...(search ? { search } : {}),
          },
        },
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "list", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/fast-track/:id — detail view for one match candidate
// ---------------------------------------------------------------------------
router.get("/:id", (req, res) => {
  try {
    const match = MOCK_FAST_TRACK_MATCHES.find((m) => m.id === req.params.id);
    if (!match) {
      return res.status(404).json(
        errorEnvelope("gda-fast-track", "detail", { code: "NOT_FOUND", message: `Match ${req.params.id} not found`, detail: null }),
      );
    }

    return res.json(
      successEnvelope("gda-fast-track", "detail", {
        match: {
          id: match.id,
          status: match.status,
          signal_type: match.signal_type,
          signal_summary: match.signal_summary,
          technology: match.technology,
          company_name: match.company_name,
          company_role: match.company_role,
          candidate_agency: match.candidate_agency,
          candidate_requirement: match.candidate_requirement,
          contract_path_hypothesis: match.contract_path_hypothesis,
          match_score: match.match_score,
          recommended_next_action: match.recommended_next_action,
          safety_lane: match.safety_lane,
          sources: match.sources,
          created_at: match.created_at,
          updated_at: match.updated_at,
          technology_tags: match.technology_tags,
          company_url: match.company_url,
          incumbent_or_competitor_context: match.incumbent_or_competitor_context,
          buyer_problem: match.buyer_problem,
          next_review_at: match.next_review_at,
          promotion_target: match.promotion_target,
        },
        analysis: match.analysis ?? null,
        ooda: match.ooda ?? null,
        sources: match.sources,
        learning: match.learning ?? { notes: [], reserved: true },
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "detail", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/fast-track/promote — promote a fast-track signal to an active opp
// ---------------------------------------------------------------------------
router.post("/promote", async (req, res) => {
  try {
    const { matchId } = req.body as { matchId: string };
    const match = MOCK_FAST_TRACK_MATCHES.find((m) => m.id === matchId);
    if (!match) {
      return res.status(404).json(
        errorEnvelope("gda-fast-track", "promote", { code: "NOT_FOUND", message: `Match ${matchId} not found`, detail: null }),
      );
    }

    // Mark as promoted in mock data
    (match as { status: string }).status = "promoted";
    (match as { promotion_target: string }).promotion_target = "ops-tracker";

    // Create a real opportunity in the database
    const pool = getPool();
    let opportunityId: string | null = null;

    if (pool) {
      try {
        const oppId = `opp-ft-${matchId}`;
        const result = await pool.query(
          `INSERT INTO opportunities (id, title, agency, department, status, capture_stage, score, value_estimated, probability_of_win, naics, tags, source, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'discovery', 'interest', $5, 0, 0, '', $6, 'fast-track', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            oppId,
            match.technology,
            match.candidate_agency ?? "TBD",
            "TBD",
            match.match_score,
            JSON.stringify(match.technology_tags ?? []),
          ],
        );
        if (result.rows.length > 0) {
          opportunityId = result.rows[0].id;
        }
      } catch {
        // DB insert failed, still return success for the mock promotion
      }
    }

    return res.json(
      successEnvelope("gda-fast-track", "promote", {
        matchId,
        status: "promoted",
        opportunityId,
        message: `${match.technology} promoted to Ops Tracker`,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "promote", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

export default router;
