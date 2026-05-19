import { Router } from "express";
import { log } from "../lib/logger";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { randomUUID } from "crypto";

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
      } catch (err) { log.warn("fast-track_fallback", { error: String(err) }); }
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
      } catch (err) { log.warn("fast-track_fallback", { error: String(err) }); }
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
    let rawRow: Record<string, unknown> | undefined;
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM fast_track_matches WHERE id = $1", [req.params.id]);
        if (rows.length > 0) rawRow = rows[0] as Record<string, unknown>;
      } catch (err) { log.warn("fast-track_fallback", { error: String(err) }); }
    }
    if (!rawRow) {
      return res.status(404).json(
        errorEnvelope("gda-fast-track", "detail", { code: "NOT_FOUND", message: `Match ${req.params.id} not found`, detail: null }),
      );
    }

    const mapped = mapDbRow(rawRow);
    return res.json(
      successEnvelope("gda-fast-track", "detail", {
        match: {
          ...mapped,
          candidate_agency: rawRow.candidate_agency ?? null,
          candidate_requirement: rawRow.candidate_requirement ?? null,
          safety_lane: rawRow.safety_lane ?? null,
          company_url: rawRow.company_url ?? null,
          incumbent_or_competitor_context: rawRow.incumbent_or_competitor_context ?? null,
          buyer_problem: rawRow.buyer_problem ?? null,
          next_review_at: rawRow.next_review_at ?? null,
          promotion_target: rawRow.promotion_target ?? null,
        },
        analysis: rawRow.analysis ?? null,
        ooda: rawRow.ooda ?? null,
        sources: mapped.sources,
        learning: rawRow.learning ?? { notes: [], reserved: true },
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
    } catch (err) {
      log.warn("fast-track_fallback", { error: String(err) });
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

// ---------------------------------------------------------------------------
// POST /api/fast-track/scan — generate fast-track signals from SAM pre-solicitation data
// ---------------------------------------------------------------------------
router.post("/scan", requireRole("admin", "bd_manager"), async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(errorEnvelope("gda-fast-track", "scan", { code: "NO_DB", message: "Database unavailable", detail: null }));
    }

    // Pull pre-solicitation opportunities from SAM monitor that match Envision NAICS codes
    const envisionNaics = ["541512", "541519", "541611", "541330", "541715", "518210", "541690", "611430"];
    const { rows: samOpps } = await pool.query(
      `SELECT id, notice_id, title, agency, sub_agency, type, naics, value_estimate, response_deadline, sam_url, ai_summary
       FROM sam_opportunities
       WHERE (type ILIKE '%pre%solicitation%' OR type ILIKE '%sources%sought%' OR type ILIKE '%special%notice%')
         AND scan_status = 'new'
         AND NOT EXISTS (SELECT 1 FROM fast_track_matches WHERE fast_track_matches.id = 'ft-' || sam_opportunities.id)
       ORDER BY created_at DESC LIMIT 50`
    );

    let inserted = 0;
    for (const opp of samOpps) {
      const naicsMatch = envisionNaics.some((n) => (opp.naics ?? "").includes(n));
      const score = naicsMatch ? 75 : 40;
      const id = `ft-${opp.id}`;

      try {
        const result = await pool.query(
          `INSERT INTO fast_track_matches (id, signal_type, signal_title, executive_summary, technology_tags, company_name, company_role,
            score, status, needs_attention, sources, contract_path, recommended_action, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            id,
            opp.type ?? "pre-solicitation",
            opp.title,
            opp.ai_summary ?? `${opp.type} from ${opp.agency ?? "Unknown Agency"}`,
            opp.naics ? [opp.naics] : [],
            opp.agency ?? "Unknown",
            "buyer",
            score,
            naicsMatch,
            JSON.stringify(opp.sam_url ? [opp.sam_url] : []),
            `SAM.gov ${opp.type ?? "pre-solicitation"} → potential RFP`,
            naicsMatch ? "Review and promote to pipeline" : "Monitor for updates",
          ]
        );
        if (result.rowCount && result.rowCount > 0) inserted++;
      } catch (err) { log.warn("fast-track_fallback", { error: String(err) }); }
    }

    return res.json(successEnvelope("gda-fast-track", "scan", {
      scanned: samOpps.length,
      inserted,
      message: `Scanned ${samOpps.length} SAM opportunities, added ${inserted} new signals`,
    }));
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-fast-track", "scan", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

export default router;
