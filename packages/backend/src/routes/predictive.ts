import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import {
  getPwinModels,
  getPwinModel,
  getPipelineForecast,
  getBidAssessments,
  getBidAssessment,
  getWinLossAnalysis,
} from "../data/predictive-mock";
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

  const models = getPwinModels();
  res.json(successEnvelope("gda-predictive", "pwin-models", {
    models,
    total: models.length,
    source: "mock",
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

  const model = getPwinModel(oppId);
  if (!model) {
    return res.status(404).json(errorEnvelope("gda-predictive", "pwin-model", {
      code: "NOT_FOUND",
      message: `No ML Pwin model for opportunity ${oppId}`,
      detail: null,
    }));
  }
  res.json(successEnvelope("gda-predictive", "pwin-model", { ...model, source: "mock" }));
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

  const forecast = getPipelineForecast();
  res.json(successEnvelope("gda-predictive", "forecast", { ...forecast, source: "mock" }));
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

  const assessments = getBidAssessments();
  res.json(successEnvelope("gda-predictive", "bid-assessments", {
    assessments,
    total: assessments.length,
    bid: assessments.filter((a) => a.recommendation === "bid").length,
    no_bid: assessments.filter((a) => a.recommendation === "no_bid").length,
    watch: assessments.filter((a) => a.recommendation === "watch").length,
    source: "mock",
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

  const assessment = getBidAssessment(oppId);
  if (!assessment) {
    return res.status(404).json(errorEnvelope("gda-predictive", "bid-assessment", {
      code: "NOT_FOUND",
      message: `No bid assessment for opportunity ${oppId}`,
      detail: null,
    }));
  }
  res.json(successEnvelope("gda-predictive", "bid-assessment", { ...assessment, source: "mock" }));
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

  const analysis = getWinLossAnalysis();
  res.json(successEnvelope("gda-predictive", "win-loss", { ...analysis, source: "mock" }));
});

export default router;
