import { Router, type Request, type Response } from "express";
import { successEnvelope } from "../middleware/envelope";
import {
  MOCK_INTEL_ITEMS,
  MOCK_BRIEFINGS,
  MOCK_RESEARCH_REPORTS,
  MOCK_COMPETITORS,
} from "../data/intel-mock";
import {
  n8nWebhookConfigured,
  fetchDeepResearchFromN8n,
  fetchCompetitorsFromN8n,
} from "../lib/n8n-data";

const router = Router();

// GET /api/intel/feed — list intel items with filtering
// NOTE: n8n gda-intel-feed webhook has a broken external dependency (Tavily API key not configured).
// Keeping mock data until the n8n workflow is fixed.
router.get("/feed", (_req: Request, res: Response) => {
  const {
    category,
    priority,
    source,
    search,
    unread,
    sortBy = "created_at",
    sortDir = "desc",
  } = _req.query;

  let items = [...MOCK_INTEL_ITEMS];

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
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.tags.some((t: string) => t.toLowerCase().includes(q))
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
  for (const item of MOCK_INTEL_ITEMS) {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
    priorityCounts[item.priority] = (priorityCounts[item.priority] ?? 0) + 1;
  }

  res.json(
    successEnvelope("GDA.api.intel-feed", "list", {
      items,
      total: MOCK_INTEL_ITEMS.length,
      filtered: items.length,
      unreadCount: MOCK_INTEL_ITEMS.filter((i) => !i.read).length,
      categoryCounts,
      priorityCounts,
      source: "mock" as const,
    })
  );
});

// GET /api/intel/briefings — list morning briefings
// NOTE: n8n gda-daily-brief webhook references a deleted credential.
// Keeping mock data until the n8n workflow is updated.
router.get("/briefings", (_req: Request, res: Response) => {
  const { date } = _req.query;
  let briefings = [...MOCK_BRIEFINGS];

  if (date && typeof date === "string") {
    briefings = briefings.filter((b) => b.date === date);
  }

  res.json(
    successEnvelope("GDA.api.daily-brief", "list", {
      briefings,
      total: briefings.length,
      source: "mock" as const,
    })
  );
});

// GET /api/intel/briefings/:id — single briefing detail
router.get("/briefings/:id", (req: Request, res: Response) => {
  const briefing = MOCK_BRIEFINGS.find((b) => b.id === req.params.id);
  if (!briefing) {
    res.status(404).json({
      success: false,
      workflow: "GDA.api.daily-brief",
      action: "detail",
      dryRun: false,
      data: null,
      meta: { generatedAt: new Date().toISOString(), source: "gateway" },
      error: { code: "NOT_FOUND", message: `Briefing ${req.params.id} not found`, detail: null },
    });
    return;
  }

  res.json(
    successEnvelope("GDA.api.daily-brief", "detail", {
      briefing,
      source: "mock" as const,
    })
  );
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

  // 2. Fallback to mock data
  let reports = [...MOCK_RESEARCH_REPORTS];

  if (status && typeof status === "string") {
    reports = reports.filter((r) => r.status === status);
  }

  const statusCounts: Record<string, number> = {};
  for (const r of MOCK_RESEARCH_REPORTS) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }

  res.json(
    successEnvelope("GDA.api.deep-research-history", "list", {
      reports,
      total: MOCK_RESEARCH_REPORTS.length,
      filtered: reports.length,
      statusCounts,
      source: "mock" as const,
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

  // 2. Fallback to mock
  const report = MOCK_RESEARCH_REPORTS.find((r) => r.id === req.params.id);
  if (!report) {
    res.status(404).json({
      success: false,
      workflow: "GDA.api.deep-research-history",
      action: "detail",
      dryRun: false,
      data: null,
      meta: { generatedAt: new Date().toISOString(), source: "gateway" },
      error: { code: "NOT_FOUND", message: `Research report ${req.params.id} not found`, detail: null },
    });
    return;
  }

  res.json(
    successEnvelope("GDA.api.deep-research-history", "detail", {
      report,
      source: "mock" as const,
    })
  );
});

// GET /api/intel/competitors — list competitor profiles
// Wired to n8n gda-deep-research-history webhook (competitor type) with mock fallback.
router.get("/competitors", async (_req: Request, res: Response) => {
  const { watch_status, search, sortBy = "threat_score", sortDir = "desc" } = _req.query;

  // 1. Try n8n webhook
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
            source: "n8n" as const,
          })
        );
        return;
      }
    } catch {
      // fall through to mock
    }
  }

  // 2. Fallback to mock data
  let competitors = [...MOCK_COMPETITORS];

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
      total: MOCK_COMPETITORS.length,
      filtered: competitors.length,
      source: "mock" as const,
    })
  );
});

export default router;
