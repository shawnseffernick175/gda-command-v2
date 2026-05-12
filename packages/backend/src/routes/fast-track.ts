import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import type { FastTrackMatch } from "@gda/shared";
import { getPool } from "../lib/db";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/fast-track/summary — top-line summary cards
// ---------------------------------------------------------------------------
router.get("/summary", async (_req, res) => {
  try {
    const pool = getPool();
    let counts = { total: 0, new_count: 0, reviewing_count: 0, watching_count: 0, promoted_count: 0, discarded_count: 0, needs_attention_count: 0 };
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT status, count(*)::int as cnt, count(*) FILTER (WHERE status = 'new' OR (status = 'reviewing' AND score >= 75))::int as attention
           FROM fast_track_matches GROUP BY status`,
        );
        let total = 0;
        let attention = 0;
        for (const r of rows) {
          total += r.cnt;
          attention += r.attention;
          if (r.status === "new") counts.new_count = r.cnt;
          else if (r.status === "reviewing") counts.reviewing_count = r.cnt;
          else if (r.status === "watching") counts.watching_count = r.cnt;
          else if (r.status === "promoted") counts.promoted_count = r.cnt;
          else if (r.status === "discarded") counts.discarded_count = r.cnt;
        }
        counts.total = total;
        counts.needs_attention_count = attention;
      } catch { /* fall through to zeros */ }
    }

    return res.json(
      successEnvelope("gda-fast-track", "summary", {
        new_count: counts.new_count,
        reviewing_count: counts.reviewing_count,
        watching_count: counts.watching_count,
        promoted_count: counts.promoted_count,
        discarded_count: counts.discarded_count,
        needs_attention_count: counts.needs_attention_count,
        total_count: counts.total,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

function mapDbRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    status: r.status,
    signal_type: r.signal_type,
    signal_summary: r.signal_title ?? r.signal_summary ?? "",
    technology: (r.technology_tags as string[] | null)?.[0] ?? r.signal_type ?? "",
    company_name: r.company_name ?? "",
    company_role: r.company_role ?? "unknown",
    contract_path_hypothesis: r.contract_path ?? "",
    match_score: parseFloat(String(r.score ?? 0)),
    recommended_next_action: r.recommended_action ?? "",
    technology_tags: r.technology_tags ?? [],
    sources: r.sources ?? [],
    needs_attention: r.needs_attention ?? false,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/fast-track/matches — list view with filters
// ---------------------------------------------------------------------------
router.get("/matches", async (req, res) => {
  try {
    const pool = getPool();
    let dbRows: Record<string, unknown>[] = [];
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM fast_track_matches ORDER BY score DESC");
        dbRows = rows;
      } catch { /* empty */ }
    }

    let items = dbRows.map(mapDbRow);
    const { status, signal_type, technology, company_role, min_match_score, search } = req.query;

    if (status && typeof status === "string") {
      items = items.filter((m) => m.status === status);
    }
    if (signal_type && typeof signal_type === "string") {
      items = items.filter((m) => m.signal_type === signal_type);
    }
    if (technology && typeof technology === "string") {
      const q = technology.toLowerCase();
      items = items.filter((m) => String(m.technology).toLowerCase().includes(q));
    }
    if (company_role && typeof company_role === "string") {
      items = items.filter((m) => m.company_role === company_role);
    }
    if (min_match_score && typeof min_match_score === "string") {
      const minScore = parseInt(min_match_score, 10);
      if (!isNaN(minScore)) {
        items = items.filter((m) => (m.match_score as number) >= minScore);
      }
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          String(m.signal_summary).toLowerCase().includes(q) ||
          String(m.technology).toLowerCase().includes(q) ||
          String(m.company_name).toLowerCase().includes(q),
      );
    }

    return res.json(
      successEnvelope("gda-fast-track", "list", {
        matches: items,
        meta: {
          count: items.length,
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
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool();
    let match: FastTrackMatch | undefined;
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM fast_track_matches WHERE id = $1", [req.params.id]);
        if (rows.length > 0) match = rows[0] as FastTrackMatch;
      } catch { /* empty */ }
    }
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
    const pool = getPool();
    let opportunityId: string | null = null;

    if (!pool) {
      return res.status(503).json(
        errorEnvelope("gda-fast-track", "promote", { code: "NO_DB", message: "Database unavailable", detail: null }),
      );
    }

    const ftResult = await pool.query("SELECT * FROM fast_track_matches WHERE id = $1", [matchId]);
    if (ftResult.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-fast-track", "promote", { code: "NOT_FOUND", message: `Match ${matchId} not found`, detail: null }),
      );
    }

    const ftMatch = ftResult.rows[0];
    const oppId = `opp-ft-${matchId}`;
    try {
      const result = await pool.query(
        `INSERT INTO opportunities (id, title, agency, department, status, score, value_estimated, probability_of_win, naics, tags, data_source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'discovery', $5, 0, 0, '', $6, 'fast-track', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          oppId,
          ftMatch.technology,
          ftMatch.candidate_agency ?? "TBD",
          "TBD",
          ftMatch.match_score,
          ftMatch.technology_tags ?? [],
        ],
      );
      if (result.rows.length > 0) {
        opportunityId = result.rows[0].id;
      }
    } catch {
      // DB insert failed — match exists but promotion insert failed
    }

    return res.json(
      successEnvelope("gda-fast-track", "promote", {
        matchId,
        status: "promoted",
        opportunityId,
        message: `${ftMatch.technology} promoted to Ops Tracker`,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "promote", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

export default router;
