import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { isLLMAvailable, chatCompletion, type ChatMessage } from "../lib/llm";


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

  // Gather broad system context
  let systemContext = "";
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
  }

  if (!isLLMAvailable()) {
    return res.json(successEnvelope("gda-ai", "ask", {
      answer: `AI model not configured. ${systemContext || ""}\n\nTo enable AI-powered answers, configure your OPENAI_API_KEY in Settings → AI Configuration.`,
    }));
  }

  try {
    const messages: ChatMessage[] = [
      { role: "system", content: `You are GDA Command's AI assistant for Envision Innovative Solutions, a SDVOSB specializing in defense IT, cybersecurity, and Army SETA. Answer the user's question concisely. Current page: ${pageContext}. ${systemContext}` },
      { role: "user", content: question },
    ];
    const result = await chatCompletion(messages);
    return res.json(successEnvelope("gda-ai", "ask", { answer: result.content }));
  } catch {
    return res.json(successEnvelope("gda-ai", "ask", {
      answer: `AI service temporarily unavailable. ${systemContext}\n\nPlease try again or check Settings → AI Configuration.`,
    }));
  }
});

export default router;
