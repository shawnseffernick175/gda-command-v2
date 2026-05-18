import { Router, type Request, type Response } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";

import {
  n8nWebhookConfigured,
  fetchDeepResearchFromN8n,
  fetchCompetitorsFromN8n,
  fetchOpsTrackerFromN8n,
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

  // DB fallback: generate research reports from competitor data
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, threat_score, market_position, strengths, weaknesses,
                recent_wins, revenue_estimate, employee_count, headquarters,
                focus_areas, key_contracts, created_at
         FROM competitors WHERE deleted_at IS NULL ORDER BY threat_score DESC NULLS LAST`
      );
      const reports = rows.map((r) => ({
        id: `research-db-${r.id}`,
        query: r.name,
        status: "completed" as const,
        summary: [
          `${r.name} — ${r.market_position ?? "Defense IT contractor"}.`,
          r.revenue_estimate ? `Estimated revenue: $${(r.revenue_estimate / 1_000_000).toFixed(0)}M.` : "",
          r.employee_count ? `~${r.employee_count.toLocaleString()} employees.` : "",
          r.headquarters ? `HQ: ${r.headquarters}.` : "",
          Array.isArray(r.strengths) && r.strengths.length > 0 ? `Key strengths: ${r.strengths.join(", ")}.` : "",
          Array.isArray(r.weaknesses) && r.weaknesses.length > 0 ? `Weaknesses: ${r.weaknesses.join(", ")}.` : "",
          Array.isArray(r.focus_areas) && r.focus_areas.length > 0 ? `Focus: ${r.focus_areas.join(", ")}.` : "",
        ].filter(Boolean).join(" "),
        findings: {
          strengths: r.strengths ?? [],
          weaknesses: r.weaknesses ?? [],
          recent_wins: r.recent_wins ?? [],
          key_contracts: r.key_contracts ?? [],
          focus_areas: r.focus_areas ?? [],
          threat_score: r.threat_score,
        },
        sources_count: 5,
        requested_at: r.created_at,
        completed_at: r.created_at,
        requested_by: "GDA Intelligence Engine",
      }));

      const statusCounts: Record<string, number> = { completed: reports.length };
      let filtered = reports;
      if (status && typeof status === "string") {
        filtered = reports.filter((r) => r.status === status);
      }

      return res.json(
        successEnvelope("GDA.api.deep-research-history", "list", {
          reports: filtered,
          total: reports.length,
          filtered: filtered.length,
          statusCounts,
          source: "db" as const,
        })
      );
    } catch { /* fall through */ }
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
          classification: (p.classification ?? "neutral") as string,
          ai_analysis: p.ai_analysis as Record<string, unknown> | null,
          analyzed_at: (p.analyzed_at ?? null) as string | null,
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

// ---------------------------------------------------------------------------
// PATCH /api/intel/competitors/:id/classify — Set Team/Threat/Neutral
// ---------------------------------------------------------------------------
router.patch("/competitors/:id/classify", requireRole("admin", "bd_manager"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { classification } = req.body as { classification?: string };
  const valid = ["team", "threat", "neutral"];

  if (!classification || !valid.includes(classification)) {
    return res.status(400).json(errorEnvelope("GDA.api.competitor-classify", "update", {
      code: "INVALID", message: `classification must be one of: ${valid.join(", ")}`, detail: null,
    }));
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("GDA.api.competitor-classify", "update", {
      code: "DB_UNAVAILABLE", message: "Database not available", detail: null,
    }));
  }

  try {
    const { rowCount } = await pool.query(
      "UPDATE competitor_profiles SET classification = $2 WHERE id = $1",
      [id, classification],
    );
    if (rowCount === 0) {
      return res.status(404).json(errorEnvelope("GDA.api.competitor-classify", "update", {
        code: "NOT_FOUND", message: `Competitor ${id} not found`, detail: null,
      }));
    }
    res.json(successEnvelope("GDA.api.competitor-classify", "update", { id, classification }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.api.competitor-classify", "update", {
      code: "INTERNAL", message: (err as Error).message, detail: null,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/intel/competitors/:id/analyze — On-demand AI analysis
// ---------------------------------------------------------------------------
router.post("/competitors/:id/analyze", requireRole("admin", "bd_manager"), async (req: Request, res: Response) => {
  const { id } = req.params;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("GDA.api.competitor-analyze", "run", {
      code: "DB_UNAVAILABLE", message: "Database not available", detail: null,
    }));
  }

  try {
    const { rows } = await pool.query("SELECT * FROM competitor_profiles WHERE id = $1", [id]);
    if (rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.api.competitor-analyze", "run", {
        code: "NOT_FOUND", message: `Competitor ${id} not found`, detail: null,
      }));
    }

    const comp = rows[0];

    // Gather recent movements
    const { rows: movements } = await pool.query(
      "SELECT * FROM competitor_movements WHERE competitor_name ILIKE $1 ORDER BY detected_at DESC LIMIT 20",
      [`%${comp.name}%`],
    );

    const { isLLMAvailable: llmCheck, chatCompletion: chat } = await import("../lib/llm");
    if (!llmCheck()) {
      return res.status(503).json(errorEnvelope("GDA.api.competitor-analyze", "run", {
        code: "LLM_UNAVAILABLE", message: "No AI model available", detail: null,
      }));
    }

    const prompt = `Analyze this defense contractor as a competitor to Envision Innovative Solutions (SDVOSB, defense IT/cyber/SETA/C5ISR, ~$382M revenue, ~41 employees):

## Company: ${comp.name}
- Threat Score: ${comp.threat_score}/100
- Contracts Won: ${comp.contracts_won} ($${Number(comp.contracts_value).toLocaleString()})
- NAICS Codes: ${(comp.primary_naics ?? []).join(", ")}
- Strengths: ${(comp.strengths ?? []).join(", ")}
- Weaknesses: ${(comp.weaknesses ?? []).join(", ")}
- Recent Wins: ${(comp.recent_wins ?? []).join(", ")}
- Classification: ${comp.classification ?? "neutral"}

## Recent Movements (${movements.length})
${movements.map((m: Record<string, unknown>) => `- [${m.movement_type}] ${m.title}: ${m.description ?? ""}`).join("\n")}

Respond with ONLY valid JSON:
{
  "threat_summary": "2-3 sentence assessment of competitive threat",
  "overlap_areas": ["area where they compete with Envision"],
  "competitive_advantages": ["their advantages over Envision"],
  "competitive_weaknesses": ["their weaknesses vs Envision"],
  "teaming_potential": "assessment of teaming partnership potential",
  "recommended_strategy": "1-2 sentence recommended strategy",
  "recommended_classification": "team|threat|neutral",
  "confidence": 0-100
}`;

    const result = await chat(
      [{ role: "system", content: "You are a defense contracting competitive intelligence analyst." }, { role: "user", content: prompt }],
      { tier: "fast" },
    );

    let analysis: Record<string, unknown>;
    try {
      const cleaned = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return res.status(500).json(errorEnvelope("GDA.api.competitor-analyze", "run", {
        code: "PARSE_ERROR", message: "Failed to parse AI response", detail: null,
      }));
    }

    // Store analysis
    await pool.query(
      "UPDATE competitor_profiles SET ai_analysis = $2, analyzed_at = NOW() WHERE id = $1",
      [id, JSON.stringify(analysis)],
    );

    res.json(successEnvelope("GDA.api.competitor-analyze", "run", {
      competitor_id: id,
      name: comp.name,
      analysis,
      model: result.model,
    }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.api.competitor-analyze", "run", {
      code: "INTERNAL", message: (err as Error).message, detail: null,
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/intel/teaming — teaming partner recommendations per opportunity
// ---------------------------------------------------------------------------
router.get("/teaming", async (_req: Request, res: Response) => {
  // Build teaming matches from top n8n opportunities + competitor data
  const pool = getPool();
  const competitors: { name: string; naics: string; capabilities: string }[] = [];
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT name, naics_codes, capabilities FROM competitor_profiles LIMIT 50");
      for (const r of rows) {
        competitors.push({
          name: r.name,
          naics: Array.isArray(r.naics_codes) ? r.naics_codes.join(",") : (r.naics_codes ?? ""),
          capabilities: Array.isArray(r.capabilities) ? r.capabilities.join(", ") : (r.capabilities ?? ""),
        });
      }
    } catch { /* no competitor table */ }
  }

  // Get opportunities from n8n or DB
  let opportunities: { id: string; title: string; department: string; value: number; naics: string; set_aside: string }[] = [];
  if (n8nWebhookConfigured()) {
    try {
      const n8n = await fetchOpsTrackerFromN8n();
      if (n8n.ok) {
        opportunities = n8n.opportunities.slice(0, 20).map((o) => ({
          id: o.id,
          title: o.title,
          department: o.department ?? "",
          value: o.value_estimated ?? 0,
          naics: o.naics ?? "",
          set_aside: o.set_aside ?? "",
        }));
      }
    } catch { /* fall through */ }
  }
  if (opportunities.length === 0 && pool) {
    try {
      const { rows } = await pool.query("SELECT id, title, department, value_estimated, naics, set_aside FROM opportunities ORDER BY value_estimated DESC NULLS LAST LIMIT 20");
      opportunities = rows.map((r) => ({
        id: r.id, title: r.title, department: r.department ?? "", value: r.value_estimated ?? 0,
        naics: r.naics ?? "", set_aside: r.set_aside ?? "",
      }));
    } catch { /* ignore */ }
  }

  // Known defense IT teaming partners from the GovCon ecosystem
  const knownPartners = [
    { name: "CACI International", capability: "Cyber Operations, C4ISR, Digital Solutions", past_performance: "10+ years DoD IT modernization" },
    { name: "ManTech International", capability: "Mission IT, Cyber, Data Analytics", past_performance: "Major DoD and IC contracts" },
    { name: "Engility (now SAIC)", capability: "Systems Engineering, Training, Analytics", past_performance: "Long-term DoD prime contracts" },
    { name: "Maximus", capability: "IT Modernization, Cloud, Citizen Services", past_performance: "Federal health IT and CMS contracts" },
    { name: "ICF International", capability: "Digital Modernization, Analytics, Advisory", past_performance: "DHS, HHS, DoD consulting" },
    { name: "Alion Science", capability: "C4ISR, Electronic Warfare, Modeling & Simulation", past_performance: "Navy and Army S&T programs" },
    { name: "Jacobs Engineering", capability: "IT Infrastructure, Cybersecurity, Cloud", past_performance: "NASA, DoD infrastructure programs" },
    { name: "Accenture Federal", capability: "Cloud, AI/ML, Digital Transformation", past_performance: "Federal civilian modernization" },
    { name: "Perspecta (now Peraton)", capability: "Cybersecurity, Cloud, Digital Transformation", past_performance: "DHA, DISA, IC programs" },
    { name: "Unison Technologies", capability: "Small Business IT, Cyber, Cloud Migration", past_performance: "SBA 8(a) graduate, DoD sub-contracts" },
  ];

  const matches = opportunities.map((opp, idx) => {
    const titleLower = opp.title.toLowerCase();
    const deptLower = (opp.department || "").toLowerCase();
    // Score each partner by keyword relevance to the opportunity
    const scored = knownPartners.map((p) => {
      let score = 0;
      const capLower = p.capability.toLowerCase();
      if (titleLower.includes("cyber") && capLower.includes("cyber")) score += 3;
      if (titleLower.includes("cloud") && capLower.includes("cloud")) score += 3;
      if (titleLower.includes("c4isr") && capLower.includes("c4isr")) score += 3;
      if (titleLower.includes("it") && capLower.includes("it")) score += 2;
      if (titleLower.includes("ai") && capLower.includes("ai")) score += 2;
      if (deptLower.includes("army") && p.past_performance.toLowerCase().includes("army")) score += 2;
      if (deptLower.includes("navy") && p.past_performance.toLowerCase().includes("navy")) score += 2;
      if (deptLower.includes("dod") && p.past_performance.toLowerCase().includes("dod")) score += 1;
      // Deterministic tiebreaker based on opportunity index
      score += ((idx + p.name.length) % 3) * 0.1;
      return { ...p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, 3);
    const partners = selected.map((p) => ({
      name: p.name,
      capability: p.capability,
      past_performance: p.past_performance,
      rationale: opp.set_aside
        ? `Strong fit for ${opp.set_aside} set-aside via mentor-protégé or JV. ${p.capability} complements Envision's ${opp.department || "defense IT"} capabilities.`
        : `${p.capability} directly relevant to "${opp.title.slice(0, 60)}". ${p.past_performance}.`,
    }));

    return {
      opportunity_id: opp.id,
      opportunity_title: opp.title,
      department: opp.department,
      value: opp.value,
      partners,
    };
  });

  res.json(successEnvelope("GDA.api.teaming", "list", { matches, total: matches.length }));
});

export default router;
