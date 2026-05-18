import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";

import { callWebhook, webhookConfig } from "../lib/n8n-client";
import { n8nWebhookConfigured } from "../lib/n8n-data";

const router = Router();

// --- Pwin Calculator ---
router.get("/pwin/:oppId", async (req, res) => {
  const { oppId } = req.params;

  // Try n8n first
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook(
        "gda-pwin-calculator",
        { body: { action: "calculate", opp_id: oppId } },
        { timeoutMs: 15_000 },
      );
      if (result.ok && result.body) {
        const raw = result.body as Record<string, unknown>;
        const breakdown = Array.isArray(raw.breakdown) ? raw.breakdown : [];
        const factors = breakdown.map((b: Record<string, unknown>) => ({
          name: String(b.factor ?? ""),
          weight: parseFloat(String(b.weight ?? "0").replace("%", "")) || 0,
          score: Number(b.score ?? 0),
          weighted_score: Number(b.weighted_contribution ?? 0),
          rationale: "",
        }));
        const mapped = {
          opp_id: oppId,
          overall_pwin: Number(raw.pwin ?? 0),
          factors,
          historical_win_rate: 0,
          confidence: (Number(raw.pwin ?? 0) >= 60 ? "high" : Number(raw.pwin ?? 0) >= 30 ? "medium" : "low") as "high" | "medium" | "low",
          last_calculated: String(raw.assessed_at ?? new Date().toISOString()),
          methodology: "GDA Command weighted scoring",
          recommendation: raw.recommendation ?? null,
          recommendation_color: raw.recommendation_color ?? null,
          gates: raw.gates ?? null,
          source: "n8n" as const,
        };
        return res.json(successEnvelope("gda-enrichments", "pwin", mapped));
      }
    } catch { /* fall through to 404 */ }
  }

  return res.status(404).json(errorEnvelope("gda-enrichments", "pwin", {
    code: "NOT_FOUND", message: `No Pwin data for opportunity ${oppId}`, detail: null,
  }));
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

  res.json(successEnvelope("gda-enrichments", "recommendations", {
    recommendations: [],
    total: 0,
    source: "db",
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

  return res.status(404).json(errorEnvelope("gda-enrichments", "incumbent", {
    code: "NOT_FOUND", message: `No incumbent data for opportunity ${oppId}`, detail: null,
  }));
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

  return res.status(404).json(errorEnvelope("gda-enrichments", "competitors", {
    code: "NOT_FOUND", message: `No competitor data for opportunity ${oppId}`, detail: null,
  }));
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

  return res.status(404).json(errorEnvelope("gda-enrichments", "blackhat", {
    code: "NOT_FOUND", message: `No black hat data for opportunity ${oppId}`, detail: null,
  }));
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

  return res.status(404).json(errorEnvelope("gda-enrichments", "wargame", {
    code: "NOT_FOUND", message: `No wargame data for opportunity ${oppId}`, detail: null,
  }));
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

  res.json(successEnvelope("gda-enrichments", "intel-modules", {
    modules: [],
    total: 0,
    source: "db",
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

  return res.status(404).json(errorEnvelope("gda-enrichments", "teaming", {
    code: "NOT_FOUND", message: `No teaming data for opportunity ${oppId}`, detail: null,
  }));
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

  res.json(successEnvelope("gda-enrichments", "search", {
    query,
    results: [],
    total: 0,
    source: "db",
  }));
});

// --- Notifications ---
router.get("/notifications", async (_req, res) => {
  res.json(successEnvelope("gda-enrichments", "notifications", {
    notifications: [],
    total: 0,
    unread: 0,
    source: "db",
  }));
});

export default router;
