import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { MOCK_SAM_OPPORTUNITIES, MOCK_SCAN_RUNS } from "../data/sam-monitor-mock";
import type { SAMMonitorOpportunity } from "../data/sam-monitor-mock";

const router = Router();

function rowToSamOpp(r: Record<string, unknown>): SAMMonitorOpportunity {
  return {
    id: r.id as string,
    notice_id: r.notice_id as string,
    title: r.title as string,
    agency: r.agency as string,
    sub_agency: (r.sub_agency as string) ?? "",
    type: r.type as string,
    set_aside: (r.set_aside as string) ?? null,
    naics: (r.naics as string) ?? "",
    naics_description: (r.naics_description as string) ?? "",
    psc: (r.psc as string) ?? "",
    value_estimate: r.value_estimate !== null ? Number(r.value_estimate) : null,
    response_deadline: r.response_deadline instanceof Date ? r.response_deadline.toISOString() : r.response_deadline ? String(r.response_deadline) : "",
    posted_date: r.posted_date instanceof Date ? r.posted_date.toISOString() : r.posted_date ? String(r.posted_date) : "",
    place_of_performance: (r.place_of_performance as string) ?? "",
    relevance_score: Number(r.relevance_score),
    relevance_reasons: (r.relevance_reasons as string[]) ?? [],
    ai_summary: (r.ai_summary as string) ?? "",
    scan_status: r.scan_status as string,
    matched_naics: Boolean(r.matched_naics),
    matched_keywords: (r.matched_keywords as string[]) ?? [],
    sam_url: (r.sam_url as string) ?? "",
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  } as SAMMonitorOpportunity;
}

router.get("/summary", async (_req, res) => {
  try {
    const pool = getPool();
    let all: SAMMonitorOpportunity[];
    let lastScanAt: string | null = null;

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM sam_opportunities");
        all = result.rows.map(rowToSamOpp);
        const scanResult = await pool.query("SELECT completed_at FROM sam_scan_runs ORDER BY completed_at DESC LIMIT 1");
        if (scanResult.rows.length > 0) {
          const ca = scanResult.rows[0].completed_at;
          lastScanAt = ca instanceof Date ? ca.toISOString() : ca ? String(ca) : null;
        }
      } catch {
        all = MOCK_SAM_OPPORTUNITIES;
        lastScanAt = MOCK_SCAN_RUNS[0]?.completed_at ?? null;
      }
    } else {
      all = MOCK_SAM_OPPORTUNITIES;
      lastScanAt = MOCK_SCAN_RUNS[0]?.completed_at ?? null;
    }

    const newCount = all.filter((o) => o.scan_status === "new").length;
    const trackedCount = all.filter((o) => o.scan_status === "tracked").length;
    const qualifiedCount = all.filter((o) => o.scan_status === "qualified").length;
    const dismissedCount = all.filter((o) => o.scan_status === "dismissed").length;
    const avgRelevance = all.length > 0 ? Math.round(all.reduce((s, o) => s + o.relevance_score, 0) / all.length) : 0;
    const naicsMatched = all.filter((o) => o.matched_naics).length;

    return res.json(
      successEnvelope("gda-sam-monitor", "summary", {
        total: all.length, new_count: newCount, tracked_count: trackedCount,
        qualified_count: qualifiedCount, dismissed_count: dismissedCount,
        avg_relevance: avgRelevance, naics_matched: naicsMatched, last_scan: lastScanAt,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-sam-monitor", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/opportunities", async (req, res) => {
  try {
    const pool = getPool();
    let items: SAMMonitorOpportunity[];

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM sam_opportunities ORDER BY relevance_score DESC");
        items = result.rows.map(rowToSamOpp);
      } catch {
        items = [...MOCK_SAM_OPPORTUNITIES];
      }
    } else {
      items = [...MOCK_SAM_OPPORTUNITIES];
    }

    const { status, type, naics, search, min_relevance } = req.query;

    if (status && typeof status === "string") items = items.filter((o) => o.scan_status === status);
    if (type && typeof type === "string") items = items.filter((o) => o.type === type);
    if (naics && typeof naics === "string") items = items.filter((o) => o.naics === naics);
    if (min_relevance && typeof min_relevance === "string") {
      const min = parseInt(min_relevance, 10);
      items = items.filter((o) => o.relevance_score >= min);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter((o) =>
        o.title.toLowerCase().includes(q) ||
        o.agency.toLowerCase().includes(q) ||
        o.naics_description.toLowerCase().includes(q) ||
        o.ai_summary.toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => b.relevance_score - a.relevance_score);

    return res.json(
      successEnvelope("gda-sam-monitor", "list", items, { total: items.length }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-sam-monitor", "list", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/opportunities/:id", async (req, res) => {
  const pool = getPool();

  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM sam_opportunities WHERE id = $1", [req.params.id]);
      if (result.rows.length > 0) {
        return res.json(successEnvelope("gda-sam-monitor", "detail", rowToSamOpp(result.rows[0])));
      }
    } catch { /* fall through */ }
  }

  const item = MOCK_SAM_OPPORTUNITIES.find((o) => o.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-sam-monitor", "detail", { code: "NOT_FOUND", message: `SAM opportunity ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-sam-monitor", "detail", item));
});

router.get("/scans", async (_req, res) => {
  const pool = getPool();

  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM sam_scan_runs ORDER BY started_at DESC");
      const runs = result.rows.map((r) => ({
        ...r,
        started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
        completed_at: r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at,
      }));
      return res.json(successEnvelope("gda-sam-monitor", "scans", runs, { total: runs.length }));
    } catch { /* fall through */ }
  }

  return res.json(
    successEnvelope("gda-sam-monitor", "scans", MOCK_SCAN_RUNS, { total: MOCK_SCAN_RUNS.length }),
  );
});

// POST /api/sam-monitor/scan — trigger scan (dry-run, needs n8n)
router.post("/scan", (_req, res) => {
  return res.json(
    successEnvelope("gda-sam-monitor", "trigger-scan", {
      scan_id: "scan-dry-run",
      message: "SAM.gov scan triggered (dry-run). In production, this queues GDA.cron.master-scanner via n8n.",
      naics_codes: ["562910", "541620", "541330", "562211"],
    }, {}, true),
  );
});

// ---------------------------------------------------------------------------
// POST /api/sam-monitor/opportunities/:id/qualify — real DB write
// ---------------------------------------------------------------------------
router.post("/opportunities/:id/qualify", async (req, res) => {
  const { id } = req.params;
  const pool = getPool();

  if (pool) {
    try {
      const current = await pool.query("SELECT id, title, scan_status FROM sam_opportunities WHERE id = $1", [id]);
      if (current.rows.length === 0) {
        return res.status(404).json(
          errorEnvelope("gda-sam-monitor", "qualify", { code: "NOT_FOUND", message: `SAM opportunity ${id} not found`, detail: null }),
        );
      }

      const prev = current.rows[0];
      await pool.query("UPDATE sam_opportunities SET scan_status = 'qualified' WHERE id = $1", [id]);

      return res.json(
        successEnvelope("gda-sam-monitor", "qualify", {
          id: prev.id,
          title: prev.title,
          previous_status: prev.scan_status,
          new_status: "qualified",
          qualified_at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      process.stderr.write(`[sam-monitor] qualify error: ${(err as Error).message}\n`);
      return res.status(500).json(
        errorEnvelope("gda-sam-monitor", "qualify", { code: "DB_ERROR", message: "Failed to qualify SAM opportunity", detail: null }),
      );
    }
  }

  // Mock fallback
  const item = MOCK_SAM_OPPORTUNITIES.find((o) => o.id === id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-sam-monitor", "qualify", { code: "NOT_FOUND", message: `SAM opportunity ${id} not found`, detail: null }),
    );
  }
  return res.json(
    successEnvelope("gda-sam-monitor", "qualify", {
      id: item.id, previous_status: item.scan_status, new_status: "qualified",
    }, {}, true),
  );
});

export default router;
