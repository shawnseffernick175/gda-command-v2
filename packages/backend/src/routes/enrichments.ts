import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { callWebhook } from "../lib/n8n-client";
import { n8nWebhookConfigured } from "../lib/n8n-data";
import { chatCompletion, isLLMAvailable } from "../lib/llm";
import { getPool } from "../lib/db";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OppContext {
  id: string;
  title: string;
  agency: string;
  department: string;
  naics: string;
  set_aside: string;
  value_estimated: number | null;
  incumbent: string;
  solicitation_number: string;
  place_of_performance: string;
}

async function getOppContext(oppId: string): Promise<OppContext | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const r = await pool.query("SELECT * FROM opportunities WHERE id = $1", [oppId]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
      id: String(row.id),
      title: row.title ?? "Unknown",
      agency: row.agency ?? "Unknown Agency",
      department: row.department ?? "",
      naics: row.naics ?? "",
      set_aside: row.set_aside ?? "Full & Open",
      value_estimated: row.value_estimated ?? null,
      incumbent: row.incumbent ?? "",
      solicitation_number: row.solicitation_number ?? "",
      place_of_performance: row.place_of_performance ?? "",
    };
  } catch {
    return null;
  }
}

async function aiJson<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  if (!isLLMAvailable()) return null;
  try {
    const resp = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { tier: "fast", temperature: 0.5, max_tokens: 3000, response_format: { type: "json_object" } },
    );
    return JSON.parse(resp.content) as T;
  } catch {
    return null;
  }
}

function isValidShape(body: unknown, requiredKey: string): boolean {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  if (obj.status === "ok" || obj.error || obj.updated) return false;
  return requiredKey in obj;
}

// ---------------------------------------------------------------------------
// Pwin Calculator
// ---------------------------------------------------------------------------
router.get("/pwin/:oppId", async (req, res) => {
  const { oppId } = req.params;

  // Try n8n
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-pwin-calculator", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body && isValidShape(result.body, "overall_pwin")) {
        return res.json(successEnvelope("gda-enrichments", "pwin", { ...(result.body as object), source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  // AI fallback
  const opp = await getOppContext(oppId);
  if (opp) {
    const data = await aiJson<Record<string, unknown>>(
      `You are a government contracting Pwin (Probability of Win) analyst. Return JSON matching this exact schema:
{
  "opp_id": string,
  "overall_pwin": number (0-1),
  "factors": [{"name": string, "weight": number (0-1), "score": number (0-1), "weighted_score": number, "rationale": string}],
  "historical_win_rate": number (0-1),
  "confidence": "high"|"medium"|"low",
  "last_calculated": ISO date string,
  "methodology": string
}
Analyze factors: past performance, technical capability, pricing, incumbent advantage, set-aside, NAICS match, competition level.`,
      `Opportunity: "${opp.title}"
Agency: ${opp.agency}
NAICS: ${opp.naics}
Set-aside: ${opp.set_aside}
Estimated value: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}
Incumbent: ${opp.incumbent || "Unknown"}
Solicitation: ${opp.solicitation_number || "N/A"}`
    );
    if (data && typeof data.overall_pwin === "number") {
      data.opp_id = oppId;
      data.source = "ai";
      data.last_calculated = new Date().toISOString();
      return res.json(successEnvelope("gda-enrichments", "pwin", data));
    }
  }

  return res.json(successEnvelope("gda-enrichments", "pwin", {
    opp_id: oppId,
    overall_pwin: 0.35,
    factors: [
      { name: "Technical Capability", weight: 0.3, score: 0.6, weighted_score: 0.18, rationale: "Awaiting detailed analysis" },
      { name: "Past Performance", weight: 0.25, score: 0.5, weighted_score: 0.125, rationale: "Awaiting detailed analysis" },
      { name: "Price Competitiveness", weight: 0.2, score: 0.5, weighted_score: 0.1, rationale: "Awaiting detailed analysis" },
      { name: "Incumbent Advantage", weight: 0.15, score: 0.3, weighted_score: 0.045, rationale: "Awaiting detailed analysis" },
      { name: "Set-Aside Eligibility", weight: 0.1, score: 0.5, weighted_score: 0.05, rationale: "Awaiting detailed analysis" },
    ],
    historical_win_rate: 0.3,
    confidence: "low",
    last_calculated: new Date().toISOString(),
    methodology: "Default estimate — AI analysis not available",
    source: "default",
  }));
});

// ---------------------------------------------------------------------------
// Smart Recommendations
// ---------------------------------------------------------------------------
router.get("/recommendations", async (_req, res) => {
  const oppId = _req.query.opp_id as string | undefined;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-smart-recommender", oppId ? { opp_id: oppId } : {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const body = result.body as Record<string, unknown>;
        const recs = Array.isArray(result.body) ? result.body : (body.recommendations ?? []);
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

// ---------------------------------------------------------------------------
// Incumbent Analysis
// ---------------------------------------------------------------------------
router.get("/incumbent/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-incumbent-analysis", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body && isValidShape(result.body, "incumbent_name")) {
        return res.json(successEnvelope("gda-enrichments", "incumbent", { ...(result.body as object), source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const opp = await getOppContext(oppId);
  if (opp) {
    const data = await aiJson<Record<string, unknown>>(
      `You are a government contracting incumbent analyst. Return JSON matching this exact schema:
{
  "opp_id": string,
  "incumbent_name": string,
  "contract_number": string,
  "contract_value": number,
  "contract_start": ISO date string,
  "contract_end": ISO date string,
  "performance_rating": "exceptional"|"very good"|"satisfactory"|"marginal"|"unsatisfactory",
  "recompete_advantage": number (0-1, how much advantage incumbent has),
  "strengths": [string array, 3-5 items],
  "weaknesses": [string array, 2-4 items],
  "key_personnel": [{"name": string, "role": string, "years_on_contract": number}],
  "protest_risk": "high"|"medium"|"low",
  "notes": string (2-3 sentence summary)
}
If the incumbent is unknown, use the agency name with "Current Contractor" and provide a reasonable analysis based on the contract type.`,
      `Opportunity: "${opp.title}"
Agency: ${opp.agency}
Department: ${opp.department}
NAICS: ${opp.naics}
Set-aside: ${opp.set_aside}
Estimated value: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}
Known Incumbent: ${opp.incumbent || "Unknown"}`
    );
    if (data && typeof data.incumbent_name === "string") {
      data.opp_id = oppId;
      data.source = "ai";
      return res.json(successEnvelope("gda-enrichments", "incumbent", data));
    }
  }

  return res.json(successEnvelope("gda-enrichments", "incumbent", {
    opp_id: oppId,
    incumbent_name: "Unknown",
    contract_number: "N/A",
    contract_value: 0,
    contract_start: "",
    contract_end: "",
    performance_rating: "satisfactory",
    recompete_advantage: 0.3,
    strengths: ["Existing contract relationship"],
    weaknesses: ["Data not yet available"],
    key_personnel: [],
    protest_risk: "medium",
    notes: "Incumbent analysis pending — AI or n8n enrichment not available.",
    source: "default",
  }));
});

// ---------------------------------------------------------------------------
// Competitor Field
// ---------------------------------------------------------------------------
router.get("/competitors/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-competitor-field", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body && isValidShape(result.body, "competitors")) {
        const body = result.body as Record<string, unknown>;
        if (Array.isArray(body.competitors)) {
          return res.json(successEnvelope("gda-enrichments", "competitors", { ...(result.body as object), source: "n8n" }));
        }
      }
    } catch { /* fall through */ }
  }

  const opp = await getOppContext(oppId);
  if (opp) {
    const data = await aiJson<Record<string, unknown>>(
      `You are a government contracting competitive intelligence analyst. Return JSON matching this exact schema:
{
  "opp_id": string,
  "competitors": [
    {
      "id": string (unique),
      "name": string (real defense/IT contractor names),
      "threat_level": "high"|"medium"|"low",
      "estimated_pwin": number (0-1),
      "strengths": [string array, 2-3 items],
      "weaknesses": [string array, 1-2 items],
      "likely_teaming": [string array of partner company names],
      "recent_wins": number (0-20),
      "size_status": "large"|"small"|"8a"|"hubzone"|"sdvosb"|"wosb",
      "notes": string
    }
  ],
  "our_position": number (1-5, our ranking among competitors),
  "total_expected_bidders": number,
  "market_analysis": string (2-3 sentence competitive landscape summary)
}
Include 3-5 realistic competitor companies based on the NAICS, agency, and contract type. Use real defense/IT contractor names relevant to the work.`,
      `Opportunity: "${opp.title}"
Agency: ${opp.agency}
NAICS: ${opp.naics}
Set-aside: ${opp.set_aside}
Estimated value: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}
Place: ${opp.place_of_performance || "N/A"}`
    );
    if (data && Array.isArray(data.competitors)) {
      data.opp_id = oppId;
      data.source = "ai";
      return res.json(successEnvelope("gda-enrichments", "competitors", data));
    }
  }

  return res.json(successEnvelope("gda-enrichments", "competitors", {
    opp_id: oppId,
    competitors: [],
    our_position: 3,
    total_expected_bidders: 5,
    market_analysis: "Competitive analysis pending — AI or n8n enrichment not available.",
    source: "default",
  }));
});

// ---------------------------------------------------------------------------
// Black Hat Analysis
// ---------------------------------------------------------------------------
router.get("/blackhat/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-black-hat", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body && isValidShape(result.body, "scenarios")) {
        const body = result.body as Record<string, unknown>;
        if (Array.isArray(body.scenarios)) {
          return res.json(successEnvelope("gda-enrichments", "blackhat", { ...(result.body as object), source: "n8n" }));
        }
      }
    } catch { /* fall through */ }
  }

  const opp = await getOppContext(oppId);
  if (opp) {
    const data = await aiJson<Record<string, unknown>>(
      `You are a government contracting Black Hat analysis expert. A Black Hat review simulates how competitors would bid against us.
Return JSON matching this exact schema:
{
  "opp_id": string,
  "scenarios": [
    {
      "competitor": string (real company name),
      "likely_strategy": string,
      "technical_approach": string,
      "pricing_strategy": string,
      "teaming_strategy": string,
      "discriminators": [string array, 2-3 items],
      "vulnerabilities": [string array, 1-2 items],
      "counter_strategy": string (how we defeat them)
    }
  ],
  "our_discriminators": [string array, 3-5 items of our competitive advantages],
  "key_takeaways": [string array, 3-4 strategic takeaways]
}
Include 2-3 competitor Black Hat scenarios with realistic strategies for the contract type.`,
      `Opportunity: "${opp.title}"
Agency: ${opp.agency}
NAICS: ${opp.naics}
Set-aside: ${opp.set_aside}
Estimated value: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}
Incumbent: ${opp.incumbent || "Unknown"}`
    );
    if (data && Array.isArray(data.scenarios)) {
      data.opp_id = oppId;
      data.source = "ai";
      return res.json(successEnvelope("gda-enrichments", "blackhat", data));
    }
  }

  return res.json(successEnvelope("gda-enrichments", "blackhat", {
    opp_id: oppId,
    scenarios: [],
    our_discriminators: [],
    key_takeaways: ["Black Hat analysis pending — AI or n8n enrichment not available."],
    source: "default",
  }));
});

// ---------------------------------------------------------------------------
// Wargame Scenarios
// ---------------------------------------------------------------------------
router.get("/wargame/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-wargame", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body && isValidShape(result.body, "scenarios")) {
        const body = result.body as Record<string, unknown>;
        if (Array.isArray(body.scenarios)) {
          return res.json(successEnvelope("gda-enrichments", "wargame", { ...(result.body as object), source: "n8n" }));
        }
      }
    } catch { /* fall through */ }
  }

  const opp = await getOppContext(oppId);
  if (opp) {
    const data = await aiJson<Record<string, unknown>>(
      `You are a government contracting wargame strategist. Return JSON matching this exact schema:
{
  "opp_id": string,
  "scenarios": [
    {
      "id": string (unique, e.g. "wg-1"),
      "name": string (scenario name),
      "probability": number (0-1),
      "description": string,
      "our_move": string,
      "competitor_response": string,
      "outcome": string,
      "risk_level": "high"|"medium"|"low"
    }
  ],
  "recommended_strategy": string (overall recommended approach),
  "confidence": number (0-1)
}
Generate 3-4 realistic wargame scenarios considering different competitive dynamics.`,
      `Opportunity: "${opp.title}"
Agency: ${opp.agency}
NAICS: ${opp.naics}
Set-aside: ${opp.set_aside}
Estimated value: ${opp.value_estimated ? `$${(opp.value_estimated / 1e6).toFixed(1)}M` : "Unknown"}
Incumbent: ${opp.incumbent || "Unknown"}`
    );
    if (data && Array.isArray(data.scenarios)) {
      data.opp_id = oppId;
      data.source = "ai";
      return res.json(successEnvelope("gda-enrichments", "wargame", data));
    }
  }

  return res.json(successEnvelope("gda-enrichments", "wargame", {
    opp_id: oppId,
    scenarios: [],
    recommended_strategy: "Wargame analysis pending — AI or n8n enrichment not available.",
    confidence: 0,
    source: "default",
  }));
});

// ---------------------------------------------------------------------------
// Capture Intel Modules
// ---------------------------------------------------------------------------
router.get("/intel-modules", async (req, res) => {
  const capturePlanId = req.query.capture_plan_id as string | undefined;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-capture-intel-modules", capturePlanId ? { capture_plan_id: capturePlanId } : {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const body = result.body as Record<string, unknown>;
        const modules = Array.isArray(result.body) ? result.body : (body.modules ?? []);
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

// ---------------------------------------------------------------------------
// Teaming Finder
// ---------------------------------------------------------------------------
router.get("/teaming/:oppId", async (req, res) => {
  const { oppId } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-teaming-finder", { opp_id: oppId }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-enrichments", "teaming", { ...(result.body as object), source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  return res.status(404).json(errorEnvelope("gda-enrichments", "teaming", {
    code: "NOT_FOUND", message: `No teaming data for opportunity ${oppId}`, detail: null,
  }));
});

// ---------------------------------------------------------------------------
// Semantic Search
// ---------------------------------------------------------------------------
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
        return res.json(successEnvelope("gda-enrichments", "search", { ...(result.body as object), source: "n8n" }));
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

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
router.get("/notifications", async (_req, res) => {
  res.json(successEnvelope("gda-enrichments", "notifications", {
    notifications: [],
    total: 0,
    unread: 0,
    source: "db",
  }));
});

export default router;
