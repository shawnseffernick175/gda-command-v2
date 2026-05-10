import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_SAM_OPPORTUNITIES, MOCK_SCAN_RUNS } from "../data/sam-monitor-mock";
import type { SAMMonitorOpportunity } from "../data/sam-monitor-mock";

const router = Router();

router.get("/summary", (_req, res) => {
  try {
    const all = MOCK_SAM_OPPORTUNITIES;
    const newCount = all.filter((o) => o.scan_status === "new").length;
    const trackedCount = all.filter((o) => o.scan_status === "tracked").length;
    const qualifiedCount = all.filter((o) => o.scan_status === "qualified").length;
    const dismissedCount = all.filter((o) => o.scan_status === "dismissed").length;
    const avgRelevance = Math.round(all.reduce((s, o) => s + o.relevance_score, 0) / all.length);
    const naicsMatched = all.filter((o) => o.matched_naics).length;
    const lastScan = MOCK_SCAN_RUNS[0];

    return res.json(
      successEnvelope("gda-sam-monitor", "summary", {
        total: all.length,
        new_count: newCount,
        tracked_count: trackedCount,
        qualified_count: qualifiedCount,
        dismissed_count: dismissedCount,
        avg_relevance: avgRelevance,
        naics_matched: naicsMatched,
        last_scan: lastScan?.completed_at ?? null,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-sam-monitor", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/opportunities", (req, res) => {
  try {
    let items: SAMMonitorOpportunity[] = [...MOCK_SAM_OPPORTUNITIES];
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

router.get("/opportunities/:id", (req, res) => {
  const item = MOCK_SAM_OPPORTUNITIES.find((o) => o.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-sam-monitor", "detail", { code: "NOT_FOUND", message: `SAM opportunity ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-sam-monitor", "detail", item));
});

router.get("/scans", (_req, res) => {
  return res.json(
    successEnvelope("gda-sam-monitor", "scans", MOCK_SCAN_RUNS, { total: MOCK_SCAN_RUNS.length }),
  );
});

router.post("/scan", (_req, res) => {
  return res.json(
    successEnvelope("gda-sam-monitor", "trigger-scan", {
      scan_id: "scan-dry-run",
      message: "SAM.gov scan triggered (dry-run). In production, this queues GDA.cron.master-scanner via n8n.",
      naics_codes: ["562910", "541620", "541330", "562211"],
    }, {}, true),
  );
});

router.post("/opportunities/:id/qualify", (req, res) => {
  const item = MOCK_SAM_OPPORTUNITIES.find((o) => o.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-sam-monitor", "qualify", { code: "NOT_FOUND", message: `SAM opportunity ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(
    successEnvelope("gda-sam-monitor", "qualify", {
      id: item.id,
      previous_status: item.scan_status,
      new_status: "qualified",
      message: `Opportunity "${item.title}" qualified for pursuit (dry-run). In production, this creates an Ops Tracker entry via n8n.`,
    }, {}, true),
  );
});

export default router;
