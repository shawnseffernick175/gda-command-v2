import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import {
  getPwinBreakdown,
  getRecommendations,
  getIncumbentAnalysis,
  getCompetitorField,
  getBlackHatAnalysis,
  getWargameData,
  getIntelModules,
  getTeamingCandidates,
  getNotifications,
  getUnreadCount,
} from "../data/enrichments-mock";
import { callWebhook, webhookConfig } from "../lib/n8n-client";
import { n8nWebhookConfigured } from "../lib/n8n-data";

const router = Router();

// --- Pwin Calculator ---
router.get("/pwin/:oppId", async (req, res) => {
  const { oppId } = req.params;

  // Try n8n first
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-pwin-calculator", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "pwin", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through to mock */ }
  }

  const data = getPwinBreakdown(oppId);
  if (!data) {
    return res.status(404).json(errorEnvelope("gda-enrichments", "pwin", {
      code: "NOT_FOUND", message: `No Pwin data for opportunity ${oppId}`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-enrichments", "pwin", { ...data, source: "mock" }));
});

// --- Smart Recommendations ---
router.get("/recommendations", async (_req, res) => {
  const oppId = _req.query.opp_id as string | undefined;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-smart-recommender", oppId ? { opp_id: oppId } : {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const recs = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).recommendations ?? [];
        return res.json(successEnvelope("gda-enrichments", "recommendations", { recommendations: recs, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const recs = getRecommendations(oppId);
  res.json(successEnvelope("gda-enrichments", "recommendations", {
    recommendations: recs,
    total: recs.length,
    source: "mock",
  }));
});

// --- Incumbent Analysis ---
router.get("/incumbent/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-incumbent-analysis", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "incumbent", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const data = getIncumbentAnalysis(oppId);
  if (!data) {
    return res.status(404).json(errorEnvelope("gda-enrichments", "incumbent", {
      code: "NOT_FOUND", message: `No incumbent data for opportunity ${oppId}`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-enrichments", "incumbent", { ...data, source: "mock" }));
});

// --- Competitor Field ---
router.get("/competitors/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-competitor-field", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "competitors", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const data = getCompetitorField(oppId);
  if (!data) {
    return res.status(404).json(errorEnvelope("gda-enrichments", "competitors", {
      code: "NOT_FOUND", message: `No competitor data for opportunity ${oppId}`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-enrichments", "competitors", { ...data, source: "mock" }));
});

// --- Black Hat Analysis ---
router.get("/blackhat/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-black-hat", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "blackhat", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const data = getBlackHatAnalysis(oppId);
  if (!data) {
    return res.status(404).json(errorEnvelope("gda-enrichments", "blackhat", {
      code: "NOT_FOUND", message: `No black hat data for opportunity ${oppId}`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-enrichments", "blackhat", { ...data, source: "mock" }));
});

// --- Wargame Scenarios ---
router.get("/wargame/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-wargame", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "wargame", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const data = getWargameData(oppId);
  if (!data) {
    return res.status(404).json(errorEnvelope("gda-enrichments", "wargame", {
      code: "NOT_FOUND", message: `No wargame data for opportunity ${oppId}`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-enrichments", "wargame", { ...data, source: "mock" }));
});

// --- Capture Intel Modules ---
router.get("/intel-modules", async (req, res) => {
  const capturePlanId = req.query.capture_plan_id as string | undefined;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-capture-intel-modules", capturePlanId ? { capture_plan_id: capturePlanId } : {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const modules = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).modules ?? [];
        return res.json(successEnvelope("gda-enrichments", "intel-modules", { modules, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const modules = getIntelModules(capturePlanId);
  res.json(successEnvelope("gda-enrichments", "intel-modules", {
    modules,
    total: modules.length,
    source: "mock",
  }));
});

// --- Teaming Finder ---
router.get("/teaming/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-teaming-finder", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "teaming", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const data = getTeamingCandidates(oppId);
  if (!data) {
    return res.status(404).json(errorEnvelope("gda-enrichments", "teaming", {
      code: "NOT_FOUND", message: `No teaming data for opportunity ${oppId}`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-enrichments", "teaming", { ...data, source: "mock" }));
});

// --- Semantic Search ---
router.post("/search", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query || query.trim().length === 0) {
    return res.status(400).json(errorEnvelope("gda-enrichments", "search", {
      code: "INVALID_QUERY", message: "Search query is required", detail: null,
    }));
  }

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-semantic-search", { query }, { timeoutMs: 20_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "search", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  // Mock search results
  const q = query.toLowerCase();
  const mockResults = [
    { type: "opportunity", id: "opp-001", title: "USACE Environmental Remediation Services", score: 0.95, snippet: "OU3 Site Cleanup — environmental remediation services for Fort Bragg", path: "/opportunities/opp-001" },
    { type: "opportunity", id: "opp-002", title: "EPA Superfund Technical Support", score: 0.88, snippet: "Region 4 Superfund site assessment and remediation support", path: "/opportunities/opp-002" },
    { type: "capture_plan", id: "CP-001", title: "USACE FUDS Remediation Capture Plan", score: 0.82, snippet: "Capture strategy for USACE Formerly Used Defense Sites", path: "/capture" },
    { type: "intel", id: "ir-001", title: "AECOM Environmental Division Restructuring", score: 0.78, snippet: "AECOM announced 15% reduction in environmental services division", path: "/intel" },
    { type: "contact", id: "CON-001", title: "James Richardson — USACE Contracting Officer", score: 0.75, snippet: "Key relationship for USACE environmental procurements", path: "/contacts" },
    { type: "compliance", id: "CR-001", title: "FAR 52.223-7 Environmental Compliance", score: 0.72, snippet: "Compliance with environmental protection requirements", path: "/compliance" },
    { type: "doctrine", id: "DOC-001", title: "Environmental Remediation SOPs", score: 0.70, snippet: "Standard operating procedures for hazardous waste remediation", path: "/doctrine" },
    { type: "proposal", id: "PROP-001", title: "USACE FUDS Phase 2 Proposal", score: 0.68, snippet: "Technical proposal for USACE FUDS remediation services", path: "/proposals" },
  ].filter((r) => r.title.toLowerCase().includes(q) || r.snippet.toLowerCase().includes(q) || q.length <= 3);

  res.json(successEnvelope("gda-enrichments", "search", {
    query,
    results: mockResults.slice(0, 10),
    total: mockResults.length,
    source: "mock",
  }));
});

// --- Notifications ---
router.get("/notifications", async (_req, res) => {
  const unreadOnly = _req.query.unread === "true";
  const notifications = getNotifications(unreadOnly);
  res.json(successEnvelope("gda-enrichments", "notifications", {
    notifications,
    total: notifications.length,
    unread: getUnreadCount(),
    source: "mock",
  }));
});

export default router;
