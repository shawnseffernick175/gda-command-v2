import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";

import { callWebhook } from "../lib/n8n-client";
import { n8nWebhookConfigured } from "../lib/n8n-data";

const router = Router();

// ---------------------------------------------------------------------------
// I-1: Dynamic Pwin Model
// ---------------------------------------------------------------------------

router.get("/pwin-models", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-pwin-models", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const models = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).models ?? [];
        return res.json(successEnvelope("gda-predictive", "pwin-models", { models, source: "n8n" }));
      }
    } catch { /* fall through to mock */ }
  }

  res.json(successEnvelope("gda-predictive", "pwin-models", {
    models: [],
    total: 0,
    source: "db",
  }));
});

router.get("/pwin-models/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-pwin-model", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-predictive", "pwin-model", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  return res.status(404).json(errorEnvelope("gda-predictive", "pwin-model", {
    code: "NOT_FOUND",
    message: `No ML Pwin model for opportunity ${oppId}`,
    detail: null,
  }));
});

// ---------------------------------------------------------------------------
// I-2: Pipeline Revenue Forecasting
// ---------------------------------------------------------------------------

router.get("/forecast", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-pipeline-forecast", {}, { timeoutMs: 20_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-predictive", "forecast", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  res.json(successEnvelope("gda-predictive", "forecast", { quarters: [], total_weighted: 0, confidence: 0, source: "db" }));
});

// ---------------------------------------------------------------------------
// I-3: Bid/No-Bid Optimizer
// ---------------------------------------------------------------------------

router.get("/bid-assessments", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-bid-assessments", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const assessments = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).assessments ?? [];
        return res.json(successEnvelope("gda-predictive", "bid-assessments", { assessments, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  res.json(successEnvelope("gda-predictive", "bid-assessments", {
    assessments: [],
    total: 0,
    bid: 0,
    no_bid: 0,
    watch: 0,
    source: "db",
  }));
});

router.get("/bid-assessments/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-bid-assessment", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-predictive", "bid-assessment", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  return res.status(404).json(errorEnvelope("gda-predictive", "bid-assessment", {
    code: "NOT_FOUND",
    message: `No bid assessment for opportunity ${oppId}`,
    detail: null,
  }));
});

// ---------------------------------------------------------------------------
// I-4: Win/Loss Pattern Analysis
// ---------------------------------------------------------------------------

router.get("/win-loss", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-win-loss-analysis", {}, { timeoutMs: 20_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-predictive", "win-loss", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  res.json(successEnvelope("gda-predictive", "win-loss", { patterns: [], total_analyzed: 0, source: "db" }));
});

export default router;
