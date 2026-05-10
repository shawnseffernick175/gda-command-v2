import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_FAST_TRACK_MATCHES } from "../data/fast-track-mock";
import type { FastTrackMatch } from "../data/fast-track-mock";

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

export default router;
