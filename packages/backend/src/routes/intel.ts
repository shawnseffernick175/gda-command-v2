import { Router, type Request, type Response } from "express";
import { successEnvelope } from "../middleware/envelope";

import {
  n8nWebhookConfigured,
  fetchDeepResearchFromN8n,
  fetchCompetitorsFromN8n,
} from "../lib/n8n-data";
import { getPool } from "../lib/db";

const router = Router();

// GET /api/intel/feed — list intel items with filtering
// NOTE: n8n gda-intel-feed webhook has a broken external dependency (Tavily API key not configured).
// Keeping mock data until the n8n workflow is fixed.
router.get("/feed", async (_req: Request, res: Response) => {
  const {
    category,
    priority,
    source,
    search,
    unread,
    sortBy = "created_at",
    sortDir = "desc",
  } = _req.query;

  let items: Array<Record<string, unknown>>;
  let dataSource: "db" = "db";
  const pool = getPool();

  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM intel_items ORDER BY created_at DESC");
      if (rows.length > 0) {
        items = rows.map((r) => ({
          ...r, read: false, tags: r.tags ?? [],
        }));
        dataSource = "db";
      } else {
        items = [];
      }
    } catch {
      items = [];
    }
  } else {
    items = [];
  }

  const allItems = [...items];

  if (category && typeof category === "string") {
    items = items.filter((i) => i.category === category);
  }
  if (priority && typeof priority === "string") {
    items = items.filter((i) => i.priority === priority);
  }
  if (source && typeof source === "string") {
    items = items.filter((i) => i.source === source);
  }
  if (unread === "true") {
    items = items.filter((i) => !i.read);
  }
  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    items = items.filter(
      (i) =>
        String(i.title ?? "").toLowerCase().includes(q) ||
        String(i.summary ?? "").toLowerCase().includes(q) ||
        (Array.isArray(i.tags) && i.tags.some((t: string) => t.toLowerCase().includes(q)))
    );
  }

  const key = String(sortBy);
  items.sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[key];
    const bv = (b as unknown as Record<string, unknown>)[key];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });
  const categoryCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};
  for (const item of allItems) {
    const cat = String(item.category ?? "");
    const pri = String(item.priority ?? "");
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    priorityCounts[pri] = (priorityCounts[pri] ?? 0) + 1;
  }

  res.json(
    successEnvelope("GDA.api.intel-feed", "list", {
      items,
      total: allItems.length,
      filtered: items.length,
      unreadCount: allItems.filter((i) => !i.read).length,
      categoryCounts,
      priorityCounts,
      source: dataSource,
    })
  );
});

// GET /api/intel/briefings — list morning briefings from DB
router.get("/briefings", async (_req: Request, res: Response) => {
  const { date } = _req.query;
  const pool = getPool();

  if (pool) {
    try {
      let query = "SELECT * FROM morning_briefings ORDER BY date DESC";
      const params: string[] = [];
      if (date && typeof date === "string") {
        query = "SELECT * FROM morning_briefings WHERE date = $1 ORDER BY date DESC";
        params.push(date);
      }
      const { rows } = await pool.query(query, params);
      if (rows.length > 0) {
        const briefings = rows.map((r) => ({
          id: r.id,
          date: typeof r.date === "string" ? r.date : (r.date as Date).toISOString().slice(0, 10),
          headline: r.headline,
          key_metrics: r.key_metrics ?? [],
          alerts: r.alerts ?? [],
          action_items: r.action_items ?? [],
          market_snapshot: r.market_snapshot ?? "",
          generated_at: r.generated_at,
        }));
        return res.json(
          successEnvelope("GDA.api.daily-brief", "list", {
            briefings,
            total: briefings.length,
            source: "db" as const,
          })
        );
      }
    } catch { /* fall through to empty */ }
  }

  res.json(
    successEnvelope("GDA.api.daily-brief", "list", {
      briefings: [],
      total: 0,
      source: "db" as const,
    })
  );
});

// GET /api/intel/briefings/:id — single briefing detail from DB
router.get("/briefings/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM morning_briefings WHERE id = $1", [req.params.id]);
      if (rows.length > 0) {
        const r = rows[0];
        return res.json(
          successEnvelope("GDA.api.daily-brief", "detail", {
            briefing: {
              id: r.id,
              date: typeof r.date === "string" ? r.date : (r.date as Date).toISOString().slice(0, 10),
              headline: r.headline,
              key_metrics: r.key_metrics ?? [],
              alerts: r.alerts ?? [],
              action_items: r.action_items ?? [],
              market_snapshot: r.market_snapshot ?? "",
              generated_at: r.generated_at,
            },
            source: "db" as const,
          })
        );
      }
    } catch { /* fall through to 404 */ }
  }

  res.status(404).json({
    success: false,
    workflow: "GDA.api.daily-brief",
    action: "detail",
    dryRun: false,
    data: null,
    meta: { generatedAt: new Date().toISOString(), source: "gateway" },
    error: { code: "NOT_FOUND", message: `Briefing ${req.params.id} not found`, detail: null },
  });
});

// GET /api/intel/research — list deep research reports
// Wired to n8n gda-deep-research-history webhook with mock fallback.
router.get("/research", async (_req: Request, res: Response) => {
  const { status } = _req.query;

  // 1. Try n8n webhook
  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchDeepResearchFromN8n();
      if (n8nResult.ok && n8nResult.reports.length > 0) {
        let reports = [...n8nResult.reports];

        if (status && typeof status === "string") {
          reports = reports.filter((r) => r.status === status);
        }

        const statusCounts: Record<string, number> = {};
        for (const r of n8nResult.reports) {
          statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
        }

        res.json(
          successEnvelope("GDA.api.deep-research-history", "list", {
            reports,
            total: n8nResult.reports.length,
            filtered: reports.length,
            statusCounts,
            source: "n8n" as const,
          })
        );
        return;
      }
    } catch {
      // fall through to mock
    }
  }

  res.json(
    successEnvelope("GDA.api.deep-research-history", "list", {
      reports: [],
      total: 0,
      filtered: 0,
      statusCounts: {},
      source: "db" as const,
    })
  );
});

// GET /api/intel/research/:id — single research report detail
router.get("/research/:id", async (req: Request, res: Response) => {
  // 1. Try n8n first
  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchDeepResearchFromN8n();
      if (n8nResult.ok) {
        const report = n8nResult.reports.find((r) => r.id === req.params.id);
        if (report) {
          res.json(
            successEnvelope("GDA.api.deep-research-history", "detail", {
              report,
              source: "n8n" as const,
            })
          );
          return;
        }
      }
    } catch {
      // fall through to mock
    }
  }

  res.status(404).json({
    success: false,
    workflow: "GDA.api.deep-research-history",
    action: "detail",
    dryRun: false,
    data: null,
    meta: { generatedAt: new Date().toISOString(), source: "gateway" },
    error: { code: "NOT_FOUND", message: `Research report ${req.params.id} not found`, detail: null },
  });
});

// GET /api/intel/competitors — list competitor profiles with movements
// Reads from DB (competitor_profiles + competitor_movements), n8n as secondary source.
router.get("/competitors", async (_req: Request, res: Response) => {
  const { watch_status, search, sortBy = "threat_score", sortDir = "desc" } = _req.query;

  const pool = getPool();

  // 1. Try DB first — competitor_profiles joined with competitor_movements
  if (pool) {
    try {
      const { rows: profiles } = await pool.query(
        "SELECT * FROM competitor_profiles ORDER BY threat_score DESC"
      );
      if (profiles.length > 0) {
        const { rows: movements } = await pool.query(
          "SELECT * FROM competitor_movements ORDER BY detected_at DESC"
        );

        const movementsByCompetitor = new Map<string, typeof movements>();
        for (const m of movements) {
          const key = (m.competitor_name as string).toLowerCase();
          // Exact match first, then best prefix match (longest profile name wins)
          let bestMatch: { id: string; len: number } | null = null;
          for (const p of profiles) {
            const pName = (p.name as string).toLowerCase();
            if (pName === key) {
              bestMatch = { id: p.id as string, len: pName.length };
              break; // exact match — stop searching
            }
            if (key.startsWith(pName) && pName.length >= 4 && (!bestMatch || pName.length > bestMatch.len)) {
              bestMatch = { id: p.id as string, len: pName.length };
            }
          }
          if (bestMatch) {
            const existing = movementsByCompetitor.get(bestMatch.id) ?? [];
            existing.push(m);
            movementsByCompetitor.set(bestMatch.id, existing);
          }
        }

        let competitors = profiles.map((p) => ({
          id: p.id as string,
          name: p.name as string,
          threat_score: Number(p.threat_score),
          contracts_won: Number(p.contracts_won),
          contracts_value: Number(p.contracts_value),
          primary_naics: (p.primary_naics ?? []) as string[],
          strengths: (p.strengths ?? []) as string[],
          weaknesses: (p.weaknesses ?? []) as string[],
          recent_wins: (p.recent_wins ?? []) as string[],
          watch_status: p.watch_status as string,
          last_updated: p.last_updated as string,
          movements: (movementsByCompetitor.get(p.id as string) ?? []).map((m) => ({
            id: m.id as string,
            movement_type: m.movement_type as string,
            title: m.title as string,
            description: (m.description ?? "") as string,
            impact_assessment: (m.impact_assessment ?? "") as string,
            threat_level: m.threat_level as string,
            source: (m.source ?? "") as string,
            source_url: (m.source_url ?? null) as string | null,
            detected_at: m.detected_at as string,
            verified: m.verified as boolean,
          })),
        }));

        // Collect all teaming_announcement movements for summary
        const teamingOpportunities = movements
          .filter((m) => m.movement_type === "teaming_announcement")
          .map((m) => ({
            id: m.id as string,
            competitor_name: m.competitor_name as string,
            title: m.title as string,
            description: (m.description ?? "") as string,
            detected_at: m.detected_at as string,
          }));

        const allCount = competitors.length;

        if (watch_status && typeof watch_status === "string") {
          competitors = competitors.filter((c) => c.watch_status === watch_status);
        }
        if (search && typeof search === "string") {
          const q = search.toLowerCase();
          competitors = competitors.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.strengths.some((s) => s.toLowerCase().includes(q)) ||
              c.recent_wins.some((w) => w.toLowerCase().includes(q)) ||
              c.movements.some((m) => m.title.toLowerCase().includes(q))
          );
        }

        const key = String(sortBy) as keyof (typeof competitors)[0];
        competitors.sort((a, b) => {
          const av = a[key];
          const bv = b[key];
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          if (typeof av === "number" && typeof bv === "number") {
            return sortDir === "asc" ? av - bv : bv - av;
          }
          const cmp = String(av).localeCompare(String(bv));
          return sortDir === "asc" ? cmp : -cmp;
        });

        res.json(
          successEnvelope("GDA.api.competitor-watchlist", "list", {
            competitors,
            total: allCount,
            filtered: competitors.length,
            teamingOpportunities,
            movementCounts: {
              total: movements.length,
              teaming: movements.filter((m) => m.movement_type === "teaming_announcement").length,
              contract_wins: movements.filter((m) => m.movement_type === "contract_win").length,
              personnel: movements.filter((m) => m.movement_type === "leadership_change" || m.movement_type === "hiring_surge").length,
              mergers: movements.filter((m) => m.movement_type === "merger_acquisition").length,
            },
            source: "db" as const,
          })
        );
        return;
      }
    } catch {
      // fall through to n8n
    }
  }

  // 2. Try n8n webhook as fallback
  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchCompetitorsFromN8n();
      if (n8nResult.ok && n8nResult.competitors.length > 0) {
        let competitors = [...n8nResult.competitors];

        if (watch_status && typeof watch_status === "string") {
          competitors = competitors.filter((c) => c.watch_status === watch_status);
        }
        if (search && typeof search === "string") {
          const q = search.toLowerCase();
          competitors = competitors.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.strengths.some((s: string) => s.toLowerCase().includes(q)) ||
              c.recent_wins.some((w: string) => w.toLowerCase().includes(q))
          );
        }

        const key = String(sortBy);
        competitors.sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[key];
          const bv = (b as unknown as Record<string, unknown>)[key];
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          if (typeof av === "number" && typeof bv === "number") {
            return sortDir === "asc" ? av - bv : bv - av;
          }
          const cmp = String(av).localeCompare(String(bv));
          return sortDir === "asc" ? cmp : -cmp;
        });

        res.json(
          successEnvelope("GDA.api.competitor-watchlist", "list", {
            competitors,
            total: n8nResult.competitors.length,
            filtered: competitors.length,
            teamingOpportunities: [],
            movementCounts: { total: 0, teaming: 0, contract_wins: 0, personnel: 0, mergers: 0 },
            source: "n8n" as const,
          })
        );
        return;
      }
    } catch {
      // fall through to empty
    }
  }

  res.json(
    successEnvelope("GDA.api.competitor-watchlist", "list", {
      competitors: [],
      total: 0,
      filtered: 0,
      teamingOpportunities: [],
      movementCounts: { total: 0, teaming: 0, contract_wins: 0, personnel: 0, mergers: 0 },
      source: "db" as const,
    })
  );
});

export default router;
