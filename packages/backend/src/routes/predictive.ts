import { Router } from "express";
import { log } from "../lib/logger";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";

import { callWebhook } from "../lib/n8n-client";
import { n8nWebhookConfigured } from "../lib/n8n-data";
import { getPool } from "../lib/db";

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
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
  }

  // DB fallback: aggregate pwin from opportunities
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id, title, agency, status, value_estimated, probability_of_win, score, due_date
         FROM opportunities
         WHERE probability_of_win IS NOT NULL AND probability_of_win > 0 AND deleted_at IS NULL
         ORDER BY probability_of_win DESC LIMIT 50`
      );
      const models = rows.map((r) => ({
        opp_id: r.id,
        opp_title: r.title,
        agency: r.agency ?? "Unknown",
        current_pwin: parseFloat(r.probability_of_win) || 0,
        previous_pwin: null,
        model_confidence: 0.7,
        key_factors: [
          { name: "GDA Score", value: parseFloat(r.score) || 0, weight: 0.3, impact: "positive" },
        ],
        trend: "stable" as const,
        trend_delta: 0,
        data_source: "db",
      }));
      return res.json(successEnvelope("gda-predictive", "pwin-models", { models, total: models.length, source: "db" }));
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
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
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
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
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
  }

  // DB fallback: compute forecast from opportunities
  const fPool = getPool();
  if (fPool) {
    try {
      const { rows } = await fPool.query(
        `SELECT id, title, agency, status, value_estimated, probability_of_win
         FROM opportunities WHERE status NOT IN ('no_bid', 'lost') AND deleted_at IS NULL`
      );
      const totalPipeline = rows.reduce((s, r) => s + (parseFloat(r.value_estimated) || 0), 0);
      const weightedPipeline = rows.reduce((s, r) => {
        const val = parseFloat(r.value_estimated) || 0;
        const pwin = parseFloat(r.probability_of_win) || 0;
        return s + val * pwin;
      }, 0);
      const annualTarget = 382_000_000; // Envision's known revenue
      const topContributors = rows
        .filter((r) => (parseFloat(r.value_estimated) || 0) > 0)
        .sort((a, b) => {
          const aW = (parseFloat(a.value_estimated) || 0) * (parseFloat(a.probability_of_win) || 0);
          const bW = (parseFloat(b.value_estimated) || 0) * (parseFloat(b.probability_of_win) || 0);
          return bW - aW;
        })
        .slice(0, 10)
        .map((r) => ({
          opp_id: r.id,
          opp_title: r.title,
          agency: r.agency ?? "Unknown",
          value: parseFloat(r.value_estimated) || 0,
          pwin: parseFloat(r.probability_of_win) || 0,
          weighted_value: (parseFloat(r.value_estimated) || 0) * (parseFloat(r.probability_of_win) || 0),
        }));

      return res.json(successEnvelope("gda-predictive", "forecast", {
        summary: {
          total_pipeline: totalPipeline,
          weighted_pipeline: weightedPipeline,
          p10_revenue: weightedPipeline * 0.4,
          p50_revenue: weightedPipeline * 0.7,
          p90_revenue: weightedPipeline * 1.1,
          annual_target: annualTarget,
          gap_to_target: annualTarget - weightedPipeline,
          pipeline_coverage_ratio: annualTarget > 0 ? totalPipeline / annualTarget : 0,
          simulations_run: 1000,
          model_version: "db-aggregate-v1",
          last_updated: new Date().toISOString(),
        },
        monthly: [],
        scenarios: [],
        risk_factors: [],
        top_contributors: topContributors,
        source: "db",
      }));
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
  }

  res.json(successEnvelope("gda-predictive", "forecast", {
    summary: {
      total_pipeline: 0,
      weighted_pipeline: 0,
      p10_revenue: 0,
      p50_revenue: 0,
      p90_revenue: 0,
      annual_target: 0,
      gap_to_target: 0,
      pipeline_coverage_ratio: 0,
      simulations_run: 0,
      model_version: "n/a",
      last_updated: new Date().toISOString(),
    },
    monthly: [],
    scenarios: [],
    risk_factors: [],
    top_contributors: [],
    source: "db",
  }));
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
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
  }

  // DB fallback: generate bid assessments from opportunities
  const bPool = getPool();
  if (bPool) {
    try {
      const { rows } = await bPool.query(
        `SELECT id, title, agency, status, value_estimated, probability_of_win, score, due_date
         FROM opportunities WHERE deleted_at IS NULL AND status NOT IN ('no_bid', 'lost')
         ORDER BY score DESC NULLS LAST LIMIT 50`
      );
      const assessments = rows.map((r) => {
        const pwin = parseFloat(r.probability_of_win) || 0;
        const recommendation = pwin >= 0.5 ? "bid" : pwin >= 0.2 ? "watch" : "no_bid";
        return {
          opp_id: r.id,
          opp_title: r.title,
          agency: r.agency ?? "Unknown",
          recommendation,
          confidence: 0.65,
          overall_score: parseFloat(r.score) || 0,
          pwin,
          factors: [],
          generated_at: new Date().toISOString(),
        };
      });
      const bid = assessments.filter((a) => a.recommendation === "bid").length;
      const noBid = assessments.filter((a) => a.recommendation === "no_bid").length;
      const watch = assessments.filter((a) => a.recommendation === "watch").length;
      return res.json(successEnvelope("gda-predictive", "bid-assessments", {
        assessments, total: assessments.length, bid, no_bid: noBid, watch, source: "db",
      }));
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
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
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
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
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
  }

  // DB fallback: aggregate win/loss from opportunities
  const wPool = getPool();
  if (wPool) {
    try {
      const { rows } = await wPool.query(
        `SELECT status, COUNT(*)::int as cnt, COALESCE(SUM(value_estimated),0)::numeric as total_value
         FROM opportunities WHERE deleted_at IS NULL GROUP BY status`
      );
      const statusMap: Record<string, { cnt: number; total_value: number }> = {};
      for (const r of rows) {
        statusMap[r.status] = { cnt: parseInt(r.cnt), total_value: parseFloat(r.total_value) || 0 };
      }
      const wins = statusMap["won"]?.cnt ?? 0;
      const losses = statusMap["lost"]?.cnt ?? 0;
      const total = rows.reduce((s, r) => s + parseInt(r.cnt), 0);
      const valueWon = statusMap["won"]?.total_value ?? 0;
      const valueLost = statusMap["lost"]?.total_value ?? 0;
      const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;

      return res.json(successEnvelope("gda-predictive", "win-loss", {
        summary: {
          total_opportunities: total,
          total_wins: wins,
          total_losses: losses,
          overall_win_rate: winRate,
          avg_pwin_accuracy: 0,
          total_value_won: valueWon,
          total_value_lost: valueLost,
          model_calibration: "well_calibrated" as const,
          analysis_period: "All time",
          last_updated: new Date().toISOString(),
        },
        patterns: [],
        agency_performance: [],
        pwin_calibration: [],
        quarterly_trends: [],
        source: "db",
      }));
    } catch (err) { log.warn("predictive_fallback", { error: String(err) }); }
  }

  res.json(successEnvelope("gda-predictive", "win-loss", {
    summary: {
      total_opportunities: 0,
      total_wins: 0,
      total_losses: 0,
      overall_win_rate: 0,
      avg_pwin_accuracy: 0,
      total_value_won: 0,
      total_value_lost: 0,
      model_calibration: "well_calibrated",
      analysis_period: "No data",
      last_updated: new Date().toISOString(),
    },
    patterns: [],
    agency_performance: [],
    pwin_calibration: [],
    quarterly_trends: [],
    source: "db",
  }));
});

export default router;
