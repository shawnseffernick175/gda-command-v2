import { Router, Request, Response } from "express";
import { requireRole } from "../lib/auth";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { isLLMAvailable, chatCompletion, type ChatMessage } from "../lib/llm";
import { gatewayCall } from "../services/llmGateway";
import { log } from "../lib/logger";


const router = Router();

// ---------------------------------------------------------------------------
// POST /api/ai/opportunity-chat — ask AI a question about a specific opportunity
// ---------------------------------------------------------------------------
router.post("/opportunity-chat", async (req, res) => {
  const { opportunityId, question, history = [] } = req.body as {
    opportunityId: string;
    question: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!question?.trim()) {
    return res.status(400).json(
      errorEnvelope("gda-ai", "opportunity-chat", {
        code: "MISSING_QUESTION",
        message: "Question is required",
        detail: null,
      })
    );
  }

  // Gather opportunity context
  let oppContext = "";
  const pool = getPool();

  if (pool) {
    try {
      const result = await pool.query(
        `SELECT id, title, agency, department, status, score, value_estimated,
                probability_of_win, naics, psc, due_date, solicitation_number,
                set_aside, place_of_performance, incumbent, tags
         FROM opportunities WHERE id = $1`,
        [opportunityId]
      );
      if (result.rows.length > 0) {
        const opp = result.rows[0];
        oppContext = `Opportunity: ${opp.title}\nAgency: ${opp.agency}\nDepartment: ${opp.department}\nStatus: ${opp.status}\nValue: $${opp.value_estimated}\nPwin: ${opp.probability_of_win}\nScore: ${opp.score}\nNAICS: ${opp.naics}\nPSC: ${opp.psc}\nDue: ${opp.due_date}\nSolicitation: ${opp.solicitation_number}\nSet-aside: ${opp.set_aside}\nLocation: ${opp.place_of_performance}\nIncumbent: ${opp.incumbent}\nTags: ${JSON.stringify(opp.tags)}`;
      }
    } catch {
      // fall through to mock
    }
  }

  /* No mock fallback — oppContext stays empty if DB has no data */

  if (!isLLMAvailable()) {
    return res.json(
      successEnvelope("gda-ai", "opportunity-chat", {
        answer: `I don't have access to an AI model right now, but here's what I know about this opportunity:\n\n${oppContext || "No data available for this opportunity."}\n\nTo enable AI-powered answers, configure your OPENAI_API_KEY in Settings → AI Configuration.`,
      })
    );
  }

  try {
    const systemPrompt = `You are an expert government contracting business development advisor for GDA/Envision Innovative Solutions, a Service-Disabled Veteran-Owned Small Business (SDVOSB) specializing in defense IT, cybersecurity, Army SETA support, and C5ISR systems engineering. You have deep knowledge of the Shipley business development process, FAR/DFARS regulations, DoD zero trust architecture, CMMC compliance, and federal procurement.

Answer the user's question about this specific opportunity using the context provided. Be concise, actionable, and specific to this opportunity. If you don't have enough data, say so and suggest what additional research would help.

OPPORTUNITY CONTEXT:
${oppContext}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role as ChatMessage["role"], content: h.content })),
      { role: "user", content: question },
    ];

    const result = await chatCompletion(messages);
    const answer = result.content;

    return res.json(
      successEnvelope("gda-ai", "opportunity-chat", { answer })
    );
  } catch (err: unknown) {
    process.stderr.write(`[ai] opportunity-chat error: ${(err as Error).message}\n`);
    return res.status(500).json(
      errorEnvelope("gda-ai", "opportunity-chat", {
        code: "AI_ERROR",
        message: "Failed to get AI response",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/ask — general purpose Q&A from any page
// Mounted separately via askRouter to avoid double-mounting aiRouter
// ---------------------------------------------------------------------------
export const askRouter = Router();
askRouter.post("/", async (req, res) => {
  const { question, context: pageContext = "" } = req.body as { question: string; context?: string };

  if (!question?.trim()) {
    return res.status(400).json(errorEnvelope("gda-ai", "ask", { code: "MISSING_QUESTION", message: "Question is required", detail: null }));
  }

  // Gather broad system context + RAG from knowledge base
  let systemContext = "";
  let ragContext = "";
  const pool = getPool();
  if (pool) {
    try {
      const [opps, risks, contacts] = await Promise.all([
        pool.query("SELECT COUNT(*) AS cnt, COALESCE(SUM(value_estimated),0) AS total FROM opportunities"),
        pool.query("SELECT COUNT(*) AS cnt FROM risks"),
        pool.query("SELECT COUNT(*) AS cnt FROM contacts"),
      ]);
      systemContext = `Envision has ${opps.rows[0].cnt} opportunities worth $${(opps.rows[0].total / 1e6).toFixed(1)}M, ${risks.rows[0].cnt} risks, and ${contacts.rows[0].cnt} contacts in the system.`;
    } catch { /* ignore */ }

    // Also pull relevant data from DB based on question keywords
    try {
      const q = question.trim().toLowerCase();
      if (q.includes("highest") || q.includes("value") || q.includes("biggest") || q.includes("largest") || q.includes("top")) {
        const top5 = await pool.query(
          `SELECT title, agency, value_estimated, score, probability_of_win, status FROM opportunities ORDER BY value_estimated DESC NULLS LAST LIMIT 5`,
        );
        if (top5.rows.length > 0) {
          ragContext += "\n\nTop opportunities by value:\n" + top5.rows.map((r: Record<string, unknown>, i: number) => `${i + 1}. ${r.title} (${r.agency}) — ${r.value_estimated != null ? `$${(Number(r.value_estimated) / 1e6).toFixed(1)}M` : "Value TBD"}, Score: ${r.score}, Pwin: ${r.probability_of_win ?? "N/A"}`).join("\n");
        }
      }
      if (q.includes("pipeline") || q.includes("stage") || q.includes("status") || q.includes("funnel")) {
        const stages = await pool.query(
          `SELECT status, COUNT(*)::int as cnt, COALESCE(SUM(value_estimated),0) as total FROM opportunities GROUP BY status ORDER BY cnt DESC`,
        );
        if (stages.rows.length > 0) {
          ragContext += "\n\nPipeline breakdown:\n" + stages.rows.map((r: Record<string, unknown>) => `- ${r.status}: ${r.cnt} opps ($${((r.total as number) / 1e6).toFixed(1)}M)`).join("\n");
        }
      }
    } catch { /* ignore */ }

    // Vector search from knowledge base
    try {
      const { isEmbeddingAvailable, vectorSearch } = await import("../lib/embeddings");
      if (isEmbeddingAvailable()) {
        const vectorResults = await vectorSearch(question.trim(), 3);
        if (vectorResults.length > 0) {
          ragContext += "\n\nRelevant knowledge base documents:\n" + vectorResults.map((vr, i) => `[${i + 1}. "${vr.document_title}" (${Math.round(vr.similarity * 100)}% match)]\n${vr.chunk_text}`).join("\n---\n");
        }
      }
    } catch { /* ignore */ }
  }

  if (!isLLMAvailable()) {
    return res.json(successEnvelope("gda-ai", "ask", {
      answer: `AI model not configured. ${systemContext || ""}\n\nTo enable AI-powered answers, configure your OPENAI_API_KEY in Settings → AI Configuration.`,
    }));
  }

  try {
    const userContent = ragContext
      ? `${question}\n\n--- Supporting Data ---${ragContext}`
      : question;
    const messages: ChatMessage[] = [
      { role: "system", content: `You are GDA Command's AI assistant for Envision Innovative Solutions, a SDVOSB specializing in defense IT, cybersecurity, and Army SETA. Answer the user's question concisely using the supporting data when provided. Always cite specific opportunity names, values, and scores. Current page: ${pageContext}. ${systemContext}` },
      { role: "user", content: userContent },
    ];
    const result = await chatCompletion(messages);
    return res.json(successEnvelope("gda-ai", "ask", { answer: result.content }));
  } catch {
    return res.json(successEnvelope("gda-ai", "ask", {
      answer: `AI service temporarily unavailable. ${systemContext}\n\nPlease try again or check Settings → AI Configuration.`,
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai/status — check LLM availability
// ---------------------------------------------------------------------------
router.get("/status", (_req, res) => {
  res.json(successEnvelope("gda-ai", "status", {
    available: isLLMAvailable(),
    provider: process.env.LLM_PROVIDER ?? "public",
    restricted_provider: !!process.env.LLM_PROVIDER_RESTRICTED,
  }));
});

// ---------------------------------------------------------------------------
// POST /api/ai/summarize/:id — generate 3-bullet executive summary (W8)
// ---------------------------------------------------------------------------
router.post("/summarize/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ai", "summarize", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
  }
  if (!isLLMAvailable()) {
    return res.status(503).json(errorEnvelope("gda-ai", "summarize", { code: "LLM_UNAVAILABLE", message: "No AI model configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.", detail: null }));
  }

  const { id } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (rows.length === 0) {
      return res.status(404).json(errorEnvelope("gda-ai", "summarize", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
    }
    const opp = rows[0];
    const classification = opp.data_classification ?? "unclassified";

    const result = await gatewayCall({
      purpose: "summarize_opp",
      classification,
      recordTable: "opportunities",
      recordId: id,
      tier: "fast",
      temperature: 0.3,
      max_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are an expert government contracting analyst. Generate a concise executive summary for the given opportunity. Return EXACTLY this format:
• [Bullet 1: What the opportunity is]
• [Bullet 2: Key requirements and fit indicators]
• [Bullet 3: Strategic relevance]

Why this matters for NewCo: [1 sentence explaining strategic relevance to the merged entity]`,
        },
        {
          role: "user",
          content: `Opportunity: ${opp.title}\nAgency: ${opp.agency ?? "Unknown"}\nNAICS: ${opp.naics ?? "N/A"}\nSet-aside: ${opp.set_aside ?? "None"}\nValue: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}\nDue: ${opp.due_date ?? "Not set"}\nDescription: ${(opp.description ?? "No description").slice(0, 2000)}\nIncumbent: ${opp.incumbent ?? "Unknown"}\nStage: ${opp.capture_stage ?? opp.status}\nPwin: ${opp.probability_of_win ? `${Math.round(opp.probability_of_win * 100)}%` : "Not scored"}`,
        },
      ],
    });

    if (!result.success) {
      const code = result.blocked ? "CLASSIFICATION_BLOCKED" : "LLM_ERROR";
      const status = result.blocked ? 403 : 500;
      return res.status(status).json(errorEnvelope("gda-ai", "summarize", { code, message: result.error ?? "Summarization failed", detail: null }));
    }

    await pool.query(
      "UPDATE opportunities SET ai_summary = $2, ai_summary_generated_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id, result.content]
    );

    return res.json(successEnvelope("gda-ai", "summarize", {
      summary: result.content,
      model: result.model,
      call_id: result.call_id,
      tokens: result.usage,
    }));
  } catch (err) {
    log.error("ai_summarize_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope("gda-ai", "summarize", { code: "INTERNAL", message: "Summarization failed", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/recommend/:id — bid/no-bid recommendation (W8)
// ---------------------------------------------------------------------------
router.post("/recommend/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ai", "recommend", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
  }
  if (!isLLMAvailable()) {
    return res.status(503).json(errorEnvelope("gda-ai", "recommend", { code: "LLM_UNAVAILABLE", message: "No AI model configured.", detail: null }));
  }

  const { id } = req.params;
  try {
    const { rows: oppRows } = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (oppRows.length === 0) {
      return res.status(404).json(errorEnvelope("gda-ai", "recommend", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
    }
    const opp = oppRows[0];
    const classification = opp.data_classification ?? "unclassified";

    // Pull entity data for context
    let entityContext = "No entity data available.";
    try {
      const { rows: entities } = await pool.query("SELECT legal_name, status, naics_codes, set_aside_status FROM company_entity WHERE deleted_at IS NULL");
      if (entities.length > 0) {
        entityContext = entities.map((e) =>
          `${e.legal_name} (${e.status}): NAICS [${e.naics_codes?.join(", ") ?? ""}], Set-aside: ${e.set_aside_status?.length ? e.set_aside_status.join(", ") : "None"}`
        ).join("\n");
      }
    } catch { /* entity table may not exist */ }

    // Pull discipline config context
    let disciplineContext = "";
    try {
      const { rows: config } = await pool.query("SELECT * FROM capture_discipline_config WHERE id = 1");
      if (config[0]) {
        disciplineContext = `Capture manager load max: ${config[0].captures_per_manager_max}. Pipeline coverage target: ${config[0].pipeline_coverage_target}×.`;
      }
    } catch { /* discipline config may not exist */ }

    const result = await gatewayCall({
      purpose: "recommend_bid",
      classification,
      recordTable: "opportunities",
      recordId: id,
      tier: "fast",
      temperature: 0.2,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a strategic bid decision advisor for a government contracting company. Analyze the opportunity and return a JSON object with this exact structure:
{
  "recommendation": "bid" | "no_bid" | "watch",
  "confidence": 0.0-1.0,
  "reasons": ["reason 1", "reason 2", ...],
  "gaps": ["gap 1", "gap 2", ...],
  "conditions": ["condition 1", ...]
}
Consider: NAICS/set-aside alignment, entity capabilities, incumbent advantage, value size, timeline, Pwin, and strategic fit.`,
        },
        {
          role: "user",
          content: `Opportunity: ${opp.title}\nAgency: ${opp.agency ?? "Unknown"}\nNAICS: ${opp.naics ?? "N/A"}\nSet-aside: ${opp.set_aside ?? "None"}\nValue: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}\nDue: ${opp.due_date ?? "Not set"}\nIncumbent: ${opp.incumbent ?? "Unknown"}\nStage: ${opp.capture_stage ?? opp.status}\nPwin: ${opp.probability_of_win ? `${Math.round(opp.probability_of_win * 100)}%` : "Not scored"}\nScore: ${opp.score ?? "Not scored"}\nDescription: ${(opp.description ?? "").slice(0, 1500)}\n\n--- Entity Capabilities ---\n${entityContext}\n\n--- Discipline Context ---\n${disciplineContext}`,
        },
      ],
    });

    if (!result.success) {
      const code = result.blocked ? "CLASSIFICATION_BLOCKED" : "LLM_ERROR";
      const status = result.blocked ? 403 : 500;
      return res.status(status).json(errorEnvelope("gda-ai", "recommend", { code, message: result.error ?? "Recommendation failed", detail: null }));
    }

    let recommendation;
    try {
      recommendation = JSON.parse(result.content);
    } catch {
      recommendation = { recommendation: "watch", confidence: 0, reasons: ["AI response could not be parsed"], gaps: [], conditions: [] };
    }

    const aiRec = { ...recommendation, model: result.model, generated_at: new Date().toISOString() };
    await pool.query(
      "UPDATE opportunities SET ai_recommendation = $2, ai_recommendation_generated_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id, JSON.stringify(aiRec)]
    );

    return res.json(successEnvelope("gda-ai", "recommend", { recommendation: aiRec, call_id: result.call_id, tokens: result.usage }));
  } catch (err) {
    log.error("ai_recommend_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope("gda-ai", "recommend", { code: "INTERNAL", message: "Recommendation failed", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai/call-log — view recent LLM calls (admin only)
// ---------------------------------------------------------------------------
router.get("/call-log", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ai", "call-log", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
  const purpose = req.query.purpose as string | undefined;

  try {
    let query = "SELECT * FROM llm_call_log";
    const params: unknown[] = [];
    if (purpose) {
      query += " WHERE purpose = $1";
      params.push(purpose);
    }
    query += " ORDER BY called_at DESC LIMIT $" + (params.length + 1);
    params.push(limit);
    const { rows } = await pool.query(query, params);
    return res.json(successEnvelope("gda-ai", "call-log", { calls: rows, count: rows.length }));
  } catch (err) {
    log.error("ai_call_log_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope("gda-ai", "call-log", { code: "QUERY_ERROR", message: "Failed to load call log", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai/summary/:id — get cached AI data for an opportunity
// ---------------------------------------------------------------------------
router.get("/summary/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ai", "summary", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
  }
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "SELECT ai_summary, ai_summary_generated_at, ai_recommendation, ai_recommendation_generated_at FROM opportunities WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json(errorEnvelope("gda-ai", "summary", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
    }
    return res.json(successEnvelope("gda-ai", "summary", rows[0]));
  } catch (err) {
    log.error("ai_summary_get_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope("gda-ai", "summary", { code: "QUERY_ERROR", message: "Failed to load AI data", detail: null }));
  }
});

export default router;
