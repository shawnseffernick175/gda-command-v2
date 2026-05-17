/**
 * Opportunity Watch Agent
 *
 * Autonomous scanner that scores opportunities against Envision's profile:
 *   1. OBSERVE — query new/unscored opportunities from both sam_opportunities and opportunities tables
 *   2. ORIENT — GPT-4o scores each opp on NAICS match, set-aside, technical fit, competitive position
 *   3. DECIDE — classify pursue (>80), evaluate (60-80), pass (<60)
 *   4. ACT — update DB scores, create intel entries, queue high-value pursues for approval
 *
 * Trigger: cron (every 6 hours) or manual via POST /api/agents/opportunity-watch/trigger
 */

import { runAgent, type AgentContext, type AgentResult } from "../lib/agent-runner";
import { chatCompletion, isLLMAvailable, type ChatMessage } from "../lib/llm";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyProfile {
  name: string;
  cage_code: string;
  naics_codes: string[];
  capabilities: string[];
  past_performance: string[];
  set_aside_types: string[];
  contract_vehicles: string[];
  certifications: string[];
  core_competencies: string[];
}

interface RawOpportunity {
  id: string;
  title: string;
  agency: string;
  sub_agency?: string;
  naics?: string;
  naics_description?: string;
  psc?: string;
  set_aside?: string;
  value_estimate?: number;
  value_estimated?: number;
  response_deadline?: string;
  due_date?: string;
  place_of_performance?: string;
  incumbent?: string;
  sam_url?: string;
  source: "sam" | "pipeline";
}

interface OodaAnalysis {
  observe: { summary: string; items: Array<{ label: string; value: string; source_ids: string[] }> };
  orient: { summary: string; items: Array<{ label: string; value: string; source_ids: string[]; type: string }> };
  decide: { summary: string; options: Array<{ label: string; rationale: string; recommended: boolean }> };
  act: { summary: string; next_steps: Array<{ action: string; owner: string | null; due_date: string | null; priority: string }> };
}

interface AnalysisBlock {
  executive_summary: string;
  strengths: string[];
  risks: string[];
  competitive_landscape: string | null;
  relevance_rationale: string | null;
  recommended_action: string | null;
}

interface ScoredOpportunity {
  id: string;
  title: string;
  agency: string;
  score: number;
  classification: "pursue" | "evaluate" | "pass";
  rationale: string;
  risks: string[];
  next_actions: string[];
  source: "sam" | "pipeline";
  ooda?: OodaAnalysis;
  analysis?: AnalysisBlock;
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const pool = getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT name, cage_code, naics_codes, capabilities, past_performance,
            set_aside_types, contract_vehicles, certifications, core_competencies
     FROM company_profile LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function getUnscoredOpportunities(limit = 20): Promise<RawOpportunity[]> {
  const pool = getPool();
  if (!pool) return [];

  const opps: RawOpportunity[] = [];

  // 1) SAM opportunities with no AI summary or low relevance score
  const samResult = await pool.query(
    `SELECT id, title, agency, sub_agency, naics, naics_description, psc,
            set_aside, value_estimate, response_deadline, place_of_performance, sam_url
     FROM sam_opportunities
     WHERE (ai_summary IS NULL OR ai_summary = '')
       AND scan_status IN ('new', 'tracked', 'qualified')
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  for (const r of samResult.rows) {
    opps.push({
      id: r.id as string,
      title: r.title as string,
      agency: r.agency as string,
      sub_agency: r.sub_agency as string | undefined,
      naics: r.naics as string | undefined,
      naics_description: r.naics_description as string | undefined,
      psc: r.psc as string | undefined,
      set_aside: r.set_aside as string | undefined,
      value_estimate: r.value_estimate != null ? Number(r.value_estimate) : undefined,
      response_deadline: r.response_deadline as string | undefined,
      place_of_performance: r.place_of_performance as string | undefined,
      sam_url: r.sam_url as string | undefined,
      source: "sam",
    });
  }

  // 2) Pipeline opportunities with score = 0 (never scored by AI)
  const remaining = limit - opps.length;
  if (remaining > 0) {
    const pipeResult = await pool.query(
      `SELECT id, title, agency, naics, psc, set_aside, value_estimated,
              due_date, place_of_performance, incumbent
       FROM opportunities
       WHERE score = 0 AND status IN ('discovery', 'qualified')
       ORDER BY created_at DESC LIMIT $1`,
      [remaining],
    );
    for (const r of pipeResult.rows) {
      opps.push({
        id: r.id as string,
        title: r.title as string,
        agency: r.agency as string,
        naics: r.naics as string | undefined,
        psc: r.psc as string | undefined,
        set_aside: r.set_aside as string | undefined,
        value_estimated: r.value_estimated != null ? Number(r.value_estimated) : undefined,
        due_date: r.due_date as string | undefined,
        place_of_performance: r.place_of_performance as string | undefined,
        incumbent: r.incumbent as string | undefined,
        source: "pipeline",
      });
    }
  }

  return opps;
}

// ---------------------------------------------------------------------------
// AI scoring
// ---------------------------------------------------------------------------

function buildScoringPrompt(opp: RawOpportunity, profile: CompanyProfile): ChatMessage[] {
  const value = opp.value_estimate ?? opp.value_estimated;
  const deadline = opp.response_deadline ?? opp.due_date;

  const system = `You are an expert government contracting business development analyst for ${profile.name} (CAGE: ${profile.cage_code}).

COMPANY PROFILE:
- NAICS codes: ${profile.naics_codes.join(", ")}
- Capabilities: ${profile.capabilities.join(", ")}
- Past performance: ${profile.past_performance.join(", ")}
- Set-aside eligibility: ${profile.set_aside_types.join(", ")}
- Contract vehicles: ${profile.contract_vehicles.join(", ")}
- Certifications: ${profile.certifications.join(", ")}
- Core competencies: ${profile.core_competencies.join(", ")}

Score this opportunity 0-100 based on:
1. NAICS Match (0-20): Do the company's NAICS codes match the opportunity's NAICS?
2. Set-Aside Eligibility (0-15): Does the company qualify for the set-aside type?
3. Technical Fit (0-25): Do capabilities and past performance align with the requirement?
4. Competitive Position (0-20): Would incumbent, contract vehicles, and certifications give an advantage?
5. Value/Risk Balance (0-20): Is the contract value appropriate and the risk manageable?

Also perform an OODA analysis (Observe, Orient, Decide, Act) for the opportunity.

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "score": <number 0-100>,
  "classification": "<pursue|evaluate|pass>",
  "rationale": "<2-3 sentence explanation>",
  "risks": ["<risk1>", "<risk2>"],
  "next_actions": ["<action1>", "<action2>"],
  "scoring_breakdown": {
    "naics_match": <0-20>,
    "set_aside_eligibility": <0-15>,
    "technical_fit": <0-25>,
    "competitive_position": <0-20>,
    "value_risk": <0-20>
  },
  "ooda": {
    "observe": {
      "summary": "<key observations about this opportunity>",
      "items": [{"label": "<label>", "value": "<detail about this observation>", "source_ids": ["SAM.gov"]}]
    },
    "orient": {
      "summary": "<how this aligns with company capabilities>",
      "items": [{"label": "<factor>", "value": "<assessment>", "source_ids": [], "type": "<high|medium|low>"}]
    },
    "decide": {
      "summary": "<decision recommendation>",
      "options": [{"label": "<option>", "rationale": "<reasoning for/against>", "recommended": true}]
    },
    "act": {
      "summary": "<immediate actions>",
      "next_steps": [{"action": "<action>", "owner": null, "due_date": null, "priority": "<high|medium|low>"}]
    }
  },
  "analysis": {
    "executive_summary": "<1-2 sentence summary>",
    "strengths": ["<strength1>", "<strength2>"],
    "risks": ["<risk1>", "<risk2>"],
    "competitive_landscape": "<assessment of competition>",
    "recommended_action": "<specific next step>"
  }
}

Classification rules: pursue = score > 80, evaluate = 60-80, pass = score < 60.`;

  const user = `OPPORTUNITY:
Title: ${opp.title}
Agency: ${opp.agency}${opp.sub_agency ? ` / ${opp.sub_agency}` : ""}
NAICS: ${opp.naics ?? "Not specified"}${opp.naics_description ? ` (${opp.naics_description})` : ""}
PSC: ${opp.psc ?? "Not specified"}
Set-Aside: ${opp.set_aside ?? "Full and open"}
Estimated Value: ${value ? `$${value.toLocaleString()}` : "Not specified"}
Response Deadline: ${deadline ?? "Not specified"}
Place of Performance: ${opp.place_of_performance ?? "Not specified"}
Incumbent: ${opp.incumbent ?? "Unknown"}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseScoreResponse(raw: string): {
  score: number;
  classification: "pursue" | "evaluate" | "pass";
  rationale: string;
  risks: string[];
  next_actions: string[];
  ooda?: OodaAnalysis;
  analysis?: AnalysisBlock;
} | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const classification = score > 80 ? "pursue" : score >= 60 ? "evaluate" : "pass";

    let ooda: OodaAnalysis | undefined;
    if (parsed.ooda) {
      ooda = {
        observe: {
          summary: String(parsed.ooda.observe?.summary || ""),
          items: Array.isArray(parsed.ooda.observe?.items) ? parsed.ooda.observe.items : [],
        },
        orient: {
          summary: String(parsed.ooda.orient?.summary || ""),
          items: Array.isArray(parsed.ooda.orient?.items) ? parsed.ooda.orient.items : [],
        },
        decide: {
          summary: String(parsed.ooda.decide?.summary || ""),
          options: Array.isArray(parsed.ooda.decide?.options) ? parsed.ooda.decide.options : [],
        },
        act: {
          summary: String(parsed.ooda.act?.summary || ""),
          next_steps: Array.isArray(parsed.ooda.act?.next_steps) ? parsed.ooda.act.next_steps : [],
        },
      };
    }

    let analysis: AnalysisBlock | undefined;
    if (parsed.analysis) {
      analysis = {
        executive_summary: String(parsed.analysis.executive_summary || ""),
        strengths: Array.isArray(parsed.analysis.strengths) ? parsed.analysis.strengths.map(String) : [],
        risks: Array.isArray(parsed.analysis.risks) ? parsed.analysis.risks.map(String) : [],
        competitive_landscape: parsed.analysis.competitive_landscape ? String(parsed.analysis.competitive_landscape) : null,
        relevance_rationale: parsed.analysis.relevance_rationale ? String(parsed.analysis.relevance_rationale) : null,
        recommended_action: parsed.analysis.recommended_action ? String(parsed.analysis.recommended_action) : null,
      };
    }

    return {
      score,
      classification,
      rationale: String(parsed.rationale || ""),
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
      next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions.map(String) : [],
      ooda,
      analysis,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Store results
// ---------------------------------------------------------------------------

async function storeResults(scored: ScoredOpportunity[]): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  for (const opp of scored) {
    if (opp.source === "sam") {
      await pool.query(
        `UPDATE sam_opportunities
         SET relevance_score = $2,
             relevance_reasons = $3,
             ai_summary = $4,
             scan_status = CASE
               WHEN scan_status = 'qualified' THEN 'qualified'
               WHEN $5 = 'pursue' THEN 'tracked'
               ELSE scan_status
             END
         WHERE id = $1`,
        [
          opp.id,
          opp.score,
          [opp.classification, ...opp.risks],
          opp.rationale,
          opp.classification,
        ],
      );
    } else {
      await pool.query(
        `UPDATE opportunities SET score = $2, probability_of_win = $3,
         ooda = $4, analysis = $5, ai_analyzed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [
          opp.id, opp.score, opp.score / 100,
          opp.ooda ? JSON.stringify(opp.ooda) : null,
          opp.analysis ? JSON.stringify(opp.analysis) : null,
        ],
      );
    }

    // Create intel feed entry for pursue and evaluate opportunities
    if (opp.classification === "pursue" || opp.classification === "evaluate") {
      await pool.query(
        `INSERT INTO intel_items (id, title, summary, category, priority, source, related_opportunity_id, tags, created_at)
         VALUES ($1, $2, $3, 'opportunity', $4, 'sam_gov', $5, $6, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          `opp-watch-${opp.id}`,
          `[${opp.classification.toUpperCase()}] ${opp.title}`,
          opp.rationale,
          opp.classification === "pursue" ? "high" : "medium",
          opp.id,
          [`score:${opp.score}`, opp.classification, opp.agency],
        ],
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Single-opportunity scoring (used by on-demand analyze endpoint)
// ---------------------------------------------------------------------------

export async function scoreSingleOpportunity(oppId: string): Promise<ScoredOpportunity | null> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  if (!isLLMAvailable()) {
    throw new Error("No LLM available — OPENAI_API_KEY or ANTHROPIC_API_KEY required");
  }

  const profile = await getCompanyProfile();
  if (!profile) throw new Error("Company profile not found in database");

  // Fetch the specific opportunity regardless of status or score
  const result = await pool.query(
    `SELECT id, title, agency, naics, psc, set_aside, value_estimated,
            due_date, place_of_performance, incumbent
     FROM opportunities WHERE id = $1`,
    [oppId],
  );

  if (result.rows.length === 0) throw new Error(`Opportunity ${oppId} not found`);

  const r = result.rows[0];
  const opp: RawOpportunity = {
    id: r.id as string,
    title: r.title as string,
    agency: r.agency as string,
    naics: r.naics as string | undefined,
    psc: r.psc as string | undefined,
    set_aside: r.set_aside as string | undefined,
    value_estimated: r.value_estimated != null ? Number(r.value_estimated) : undefined,
    due_date: r.due_date as string | undefined,
    place_of_performance: r.place_of_performance as string | undefined,
    incumbent: r.incumbent as string | undefined,
    source: "pipeline",
  };

  const messages = buildScoringPrompt(opp, profile);
  const llmResult = await chatCompletion(messages, { tier: "fast" });
  const parsed = parseScoreResponse(llmResult.content);

  if (!parsed) return null;

  const scored: ScoredOpportunity = {
    id: opp.id,
    title: opp.title,
    agency: opp.agency,
    score: parsed.score,
    classification: parsed.classification,
    rationale: parsed.rationale,
    risks: parsed.risks,
    next_actions: parsed.next_actions,
    source: opp.source,
    ooda: parsed.ooda,
    analysis: parsed.analysis,
  };

  await storeResults([scored]);
  return scored;
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

export async function runOpportunityWatch(trigger: "cron" | "manual" | "webhook" = "manual") {
  return runAgent("opportunity-watch", trigger, async (ctx: AgentContext): Promise<AgentResult> => {
    if (!isLLMAvailable()) {
      throw new Error("No LLM available — OPENAI_API_KEY or ANTHROPIC_API_KEY required");
    }

    // OBSERVE — gather unscored opportunities
    const profile = await getCompanyProfile();
    if (!profile) {
      throw new Error("Company profile not found in database");
    }

    const opps = await getUnscoredOpportunities(20);
    if (opps.length === 0) {
      log.info("opportunity_watch_no_new", { runId: ctx.runId });
      return {
        items_processed: 0,
        items_flagged: 0,
        summary: { message: "No unscored opportunities found", scored: [] },
      };
    }

    log.info("opportunity_watch_scoring", { runId: ctx.runId, count: opps.length });

    // ORIENT — score each opportunity with AI
    const scored: ScoredOpportunity[] = [];
    for (const opp of opps) {
      try {
        const messages = buildScoringPrompt(opp, profile);
        const result = await chatCompletion(messages, { tier: "fast" });
        const parsed = parseScoreResponse(result.content);

        if (parsed) {
          scored.push({
            id: opp.id,
            title: opp.title,
            agency: opp.agency,
            score: parsed.score,
            classification: parsed.classification,
            rationale: parsed.rationale,
            risks: parsed.risks,
            next_actions: parsed.next_actions,
            source: opp.source,
            ooda: parsed.ooda,
            analysis: parsed.analysis,
          });
        } else {
          log.warn("opportunity_watch_parse_error", { oppId: opp.id, raw: result.content.slice(0, 200) });
        }
      } catch (e) {
        log.warn("opportunity_watch_score_error", { oppId: opp.id, error: (e as Error).message });
      }
    }

    // DECIDE — classify and rank
    scored.sort((a, b) => b.score - a.score);
    const pursueOpps = scored.filter((o) => o.classification === "pursue");
    const evaluateOpps = scored.filter((o) => o.classification === "evaluate");
    const passOpps = scored.filter((o) => o.classification === "pass");

    // ACT — store results and create approvals for pursue opportunities
    await storeResults(scored);

    for (const opp of pursueOpps) {
      await ctx.addApproval({
        type: "opportunity_action",
        title: `Pursue: ${opp.title}`,
        summary: `AI scored ${opp.score}/100 for ${opp.agency}. ${opp.rationale}`,
        data: {
          opportunity_id: opp.id,
          score: opp.score,
          classification: opp.classification,
          agency: opp.agency,
          risks: opp.risks,
          next_actions: opp.next_actions,
        },
        priority: opp.score >= 90 ? "critical" : "high",
      });
    }

    log.info("opportunity_watch_complete", {
      runId: ctx.runId,
      total: scored.length,
      pursue: pursueOpps.length,
      evaluate: evaluateOpps.length,
      pass: passOpps.length,
    });

    return {
      items_processed: scored.length,
      items_flagged: pursueOpps.length + evaluateOpps.length,
      summary: {
        total_scored: scored.length,
        pursue: pursueOpps.length,
        evaluate: evaluateOpps.length,
        pass: passOpps.length,
        top_opportunities: pursueOpps.slice(0, 5).map((o) => ({
          id: o.id,
          title: o.title,
          agency: o.agency,
          score: o.score,
        })),
      },
    };
  });
}
