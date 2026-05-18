import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import { chatCompletion, isLLMAvailable, getAvailableModels, type ModelTier } from "../lib/llm";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: log AI usage
// ---------------------------------------------------------------------------
async function logUsage(opts: {
  userId?: string;
  opportunityId?: string;
  action: string;
  modelTier: ModelTier;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  status: "success" | "error";
  errorMessage?: string;
}) {
  const pool = getPool();
  if (!pool) return;

  try {
    const id = `aiu-${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO ai_usage_log
        (id, user_id, opportunity_id, action, model_tier, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        opts.userId ?? null,
        opts.opportunityId ?? null,
        opts.action,
        opts.modelTier,
        opts.promptTokens ?? 0,
        opts.completionTokens ?? 0,
        (opts.promptTokens ?? 0) + (opts.completionTokens ?? 0),
        opts.latencyMs,
        opts.status,
        opts.errorMessage ?? null,
      ]
    );
  } catch {
    // Non-critical — don't block the response
  }
}

// ---------------------------------------------------------------------------
// GET /api/ai-gateway/status
// LLM availability and model info
// ---------------------------------------------------------------------------
router.get("/status", (_req, res) => {
  const models = getAvailableModels();
  res.json(
    successEnvelope("gda-ai-gateway", "status", {
      available: isLLMAvailable(),
      models,
      fast_model: models.fast ? "gpt-4o" : null,
      deep_model: models.deep ? "claude-sonnet" : null,
    })
  );
});

// ---------------------------------------------------------------------------
// POST /api/ai-gateway/summarize
// Summarize opportunity description or any text
// ---------------------------------------------------------------------------
router.post("/summarize", async (req, res) => {
  if (!isLLMAvailable()) {
    return res.status(503).json(
      errorEnvelope("gda-ai-gateway", "summarize", {
        code: "LLM_UNAVAILABLE",
        message: "No LLM API keys configured.",
        detail: null,
      })
    );
  }

  const { text, opportunity_id, max_sentences } = req.body as {
    text: string;
    opportunity_id?: string;
    max_sentences?: number;
  };

  if (!text || text.trim().length === 0) {
    return res.status(400).json(
      errorEnvelope("gda-ai-gateway", "summarize", {
        code: "INVALID_INPUT",
        message: "Text is required.",
        detail: null,
      })
    );
  }

  const tier: ModelTier = "fast";
  const sentences = max_sentences ?? 3;
  const start = Date.now();

  try {
    const result = await chatCompletion(
      [
        {
          role: "system",
          content: `You are a concise government contracting analyst. Summarize the provided text in exactly ${sentences} sentences. Focus on: scope of work, key requirements, evaluation criteria, and any notable constraints. Be specific and actionable.`,
        },
        {
          role: "user",
          content: text.slice(0, 8000),
        },
      ],
      { tier }
    );

    const latency = Date.now() - start;
    const userId = req.user?.userId;

    await logUsage({
      userId,
      opportunityId: opportunity_id,
      action: "summarize",
      modelTier: result.tier,
      promptTokens: result.usage.prompt_tokens,
      completionTokens: result.usage.completion_tokens,
      latencyMs: latency,
      status: "success",
    });

    res.json(
      successEnvelope("gda-ai-gateway", "summarize", {
        summary: result.content,
        model_tier: result.tier,
        latency_ms: latency,
      })
    );
  } catch (err) {
    const latency = Date.now() - start;
    await logUsage({
      userId: req.user?.userId,
      opportunityId: opportunity_id,
      action: "summarize",
      modelTier: tier,
      latencyMs: latency,
      status: "error",
      errorMessage: (err as Error).message,
    });

    res.status(500).json(
      errorEnvelope("gda-ai-gateway", "summarize", {
        code: "LLM_ERROR",
        message: "Failed to generate summary.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai-gateway/bid-recommendation/:opportunityId
// AI-powered bid/no-bid recommendation
// ---------------------------------------------------------------------------
router.post(
  "/bid-recommendation/:opportunityId",
  requireRole("admin", "bd_manager", "capture_lead"),
  async (req, res) => {
    const { opportunityId } = req.params;
    const pool = getPool();

    if (!isLLMAvailable()) {
      return res.status(503).json(
        errorEnvelope("gda-ai-gateway", "bid-recommendation", {
          code: "LLM_UNAVAILABLE",
          message: "No LLM API keys configured.",
          detail: null,
        })
      );
    }

    if (!pool) {
      return res.status(503).json(
        errorEnvelope("gda-ai-gateway", "bid-recommendation", {
          code: "DB_UNAVAILABLE",
          message: "Database not available.",
          detail: null,
        })
      );
    }

    try {
      // Fetch opportunity details
      const oppRes = await pool.query(
        `SELECT id, title, description, agency, status, score, value_estimated,
                due_date, set_aside, capture_stage, naics_code, tags
         FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
        [opportunityId]
      );

      if (oppRes.rows.length === 0) {
        return res.status(404).json(
          errorEnvelope("gda-ai-gateway", "bid-recommendation", {
            code: "NOT_FOUND",
            message: "Opportunity not found.",
            detail: null,
          })
        );
      }

      const opp = oppRes.rows[0];
      const tier: ModelTier = "fast";
      const start = Date.now();

      const prompt = `Analyze this government contracting opportunity and provide a bid/no-bid recommendation.

Opportunity:
- Title: ${opp.title}
- Agency: ${opp.agency ?? "Unknown"}
- Value: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}
- Due Date: ${opp.due_date ?? "Unknown"}
- NAICS: ${opp.naics_code ?? "Unknown"}
- Set-Aside: ${opp.set_aside ?? "None"}
- Current Score: ${opp.score ?? "Not scored"}
- Description: ${(opp.description ?? "").slice(0, 3000)}

Respond in this exact JSON format:
{
  "recommendation": "bid" | "no_bid" | "conditional_bid",
  "confidence": <number 0-100>,
  "rationale": "<2-3 sentence explanation>",
  "factors": [
    {"name": "<factor>", "impact": "positive" | "negative" | "neutral", "detail": "<brief explanation>"}
  ]
}

Consider: competitive landscape, alignment with typical GovCon capabilities, timeline feasibility, value/effort ratio, and set-aside requirements.`;

      const result = await chatCompletion(
        [
          {
            role: "system",
            content: "You are an expert government contracting bid decision advisor. Always respond with valid JSON only, no markdown.",
          },
          { role: "user", content: prompt },
        ],
        { tier }
      );

      const latency = Date.now() - start;

      // Parse AI response
      let parsed: {
        recommendation: string;
        confidence: number;
        rationale: string;
        factors: Array<{ name: string; impact: string; detail: string }>;
      };

      try {
        const cleaned = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = {
          recommendation: "conditional_bid",
          confidence: 50,
          rationale: result.content.slice(0, 500),
          factors: [],
        };
      }

      // Normalize recommendation
      const validRecs = ["bid", "no_bid", "conditional_bid"];
      if (!validRecs.includes(parsed.recommendation)) {
        parsed.recommendation = "conditional_bid";
      }
      if (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence)) {
        parsed.confidence = 50;
      } else {
        parsed.confidence = Math.max(0, Math.min(100, parsed.confidence));
      }
      if (!Array.isArray(parsed.factors)) {
        parsed.factors = [];
      }

      // Store recommendation
      const recId = `br-${crypto.randomUUID().slice(0, 8)}`;
      await pool.query(
        `INSERT INTO bid_recommendations (id, opportunity_id, recommendation, confidence, rationale, factors, recommended_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [recId, opportunityId, parsed.recommendation, parsed.confidence, parsed.rationale, JSON.stringify(parsed.factors), req.user?.userId ?? "system"]
      );

      await logUsage({
        userId: req.user?.userId,
        opportunityId,
        action: "bid-recommendation",
        modelTier: result.tier,
        latencyMs: latency,
        status: "success",
      });

      res.json(
        successEnvelope("gda-ai-gateway", "bid-recommendation", {
          id: recId,
          opportunity_id: opportunityId,
          ...parsed,
          model_tier: result.tier,
          latency_ms: latency,
        })
      );
    } catch (err) {
      process.stderr.write(`[ai-gateway] bid-recommendation error: ${(err as Error).message}\n`);
      res.status(500).json(
        errorEnvelope("gda-ai-gateway", "bid-recommendation", {
          code: "INTERNAL",
          message: "Failed to generate bid recommendation.",
          detail: null,
        })
      );
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/ai-gateway/bid-recommendations/:opportunityId
// History of bid recommendations for an opportunity
// ---------------------------------------------------------------------------
router.get("/bid-recommendations/:opportunityId", async (req, res) => {
  const { opportunityId } = req.params;
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope("gda-ai-gateway", "bid-recommendations", { recommendations: [] })
    );
  }

  try {
    const result = await pool.query(
      `SELECT * FROM bid_recommendations
       WHERE opportunity_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [opportunityId]
    );

    res.json(
      successEnvelope("gda-ai-gateway", "bid-recommendations", {
        recommendations: result.rows,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("gda-ai-gateway", "bid-recommendations", {
        code: "INTERNAL",
        message: "Failed to load bid recommendations.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai-gateway/usage
// AI usage analytics
// ---------------------------------------------------------------------------
router.get("/usage", requireRole("admin"), async (_req, res) => {
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope("gda-ai-gateway", "usage", {
        total_calls: 0,
        total_tokens: 0,
        by_action: [],
        by_model: [],
        recent: [],
      })
    );
  }

  try {
    const totalRes = await pool.query(
      "SELECT COUNT(*) AS total_calls, COALESCE(SUM(total_tokens), 0) AS total_tokens FROM ai_usage_log"
    );

    const byActionRes = await pool.query(
      `SELECT action, COUNT(*) AS count, COALESCE(SUM(total_tokens), 0) AS tokens,
              ROUND(AVG(latency_ms)) AS avg_latency_ms
       FROM ai_usage_log GROUP BY action ORDER BY count DESC`
    );

    const byModelRes = await pool.query(
      `SELECT model_tier, COUNT(*) AS count, COALESCE(SUM(total_tokens), 0) AS tokens
       FROM ai_usage_log GROUP BY model_tier ORDER BY count DESC`
    );

    const recentRes = await pool.query(
      `SELECT id, action, model_tier, total_tokens, latency_ms, status, created_at
       FROM ai_usage_log ORDER BY created_at DESC LIMIT 20`
    );

    const totals = totalRes.rows[0] ?? { total_calls: 0, total_tokens: 0 };

    res.json(
      successEnvelope("gda-ai-gateway", "usage", {
        total_calls: Number(totals.total_calls),
        total_tokens: Number(totals.total_tokens),
        by_action: byActionRes.rows,
        by_model: byModelRes.rows,
        recent: recentRes.rows,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("gda-ai-gateway", "usage", {
        code: "INTERNAL",
        message: "Failed to load usage analytics.",
        detail: null,
      })
    );
  }
});

export default router;
