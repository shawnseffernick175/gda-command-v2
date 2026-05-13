/**
 * Capture Coach Agent
 *
 * Per-opportunity AI strategy advisor:
 *   1. OBSERVE — gather opportunity details, company profile, CPARS, competitor intel, capture plan
 *   2. ORIENT — Claude (deep tier) generates strategic analysis
 *   3. DECIDE — structure into win probability, strategy, gaps, risks, next actions
 *   4. ACT — store result, queue critical items for approval
 *
 * Trigger: manual via POST /api/agents/capture-coach/trigger { opportunityId }
 */

import { runAgent, type AgentContext, type AgentResult } from "../lib/agent-runner";
import { chatCompletion, isLLMAvailable, isDeepModelAvailable, type ChatMessage } from "../lib/llm";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpportunityData {
  id: string;
  title: string;
  agency: string;
  department: string;
  status: string;
  score: number | null;
  value_estimated: number | null;
  probability_of_win: number | null;
  naics: string;
  psc: string;
  due_date: string | null;
  solicitation_number: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  incumbent: string | null;
  tags: string[];
}

interface CompanyProfile {
  name: string;
  cage_code: string;
  naics_codes: string[];
  capabilities: string[];
  core_competencies: string[];
  set_aside_categories: string[];
  past_performance_summary: string;
}

interface CparsRecord {
  contract_name: string;
  agency: string;
  rating: string;
  period: string;
}

interface CompetitorMovement {
  competitor_name: string;
  title: string;
  description: string;
  threat_level: string;
}

interface CapturePlanData {
  phase: string;
  pwin: number;
  bid_decision: string;
  win_themes: string[];
  discriminators: string[];
  teaming_partners: Array<{ name: string; role: string; capability: string; status: string }>;
  risks: Array<{ description: string; likelihood: string; impact: string; mitigation: string }>;
}

export interface CaptureCoachAnalysis {
  opportunity_id: string;
  win_probability: {
    score: number;
    confidence: "high" | "medium" | "low";
    factors: Array<{ factor: string; impact: "positive" | "negative" | "neutral"; detail: string }>;
  };
  capture_strategy: {
    approach: string;
    discriminators: string[];
    win_themes: string[];
    teaming_recommendations: Array<{ partner_type: string; rationale: string }>;
  };
  gap_analysis: Array<{
    gap: string;
    severity: "critical" | "high" | "medium" | "low";
    mitigation: string;
  }>;
  risk_assessment: Array<{
    risk: string;
    likelihood: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    mitigation: string;
  }>;
  next_actions: Array<{
    action: string;
    priority: "critical" | "high" | "medium" | "low";
    owner: string;
    timeline: string;
  }>;
  executive_summary: string;
  model_used: string;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Data gathering (OBSERVE)
// ---------------------------------------------------------------------------

async function fetchOpportunity(oppId: string): Promise<OpportunityData | null> {
  const pool = getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id, title, agency, department, status, score, value_estimated,
            probability_of_win, naics, psc, due_date, solicitation_number,
            set_aside, place_of_performance, incumbent, tags
     FROM opportunities WHERE id = $1`,
    [oppId],
  );
  return result.rows[0] as OpportunityData | undefined ?? null;
}

async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const pool = getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT name, cage_code, naics_codes, capabilities, core_competencies,
            set_aside_categories, past_performance_summary
     FROM company_profiles LIMIT 1`,
  );
  return result.rows[0] as CompanyProfile | undefined ?? null;
}

async function fetchRelevantCpars(agency: string): Promise<CparsRecord[]> {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT contract_title AS contract_name, agency, overall_rating AS rating,
            period_of_performance AS period
     FROM cpars_records
     WHERE agency ILIKE $1
     ORDER BY evaluation_date DESC NULLS LAST
     LIMIT 10`,
    [`%${agency}%`],
  );
  return result.rows as CparsRecord[];
}

async function fetchCompetitorIntel(agency: string): Promise<CompetitorMovement[]> {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT cp.name AS competitor_name, cm.title, cm.description, cm.threat_level
     FROM competitor_movements cm
     JOIN competitor_profiles cp ON cp.id = cm.competitor_id
     WHERE cm.description ILIKE $1
     ORDER BY cm.detected_at DESC
     LIMIT 10`,
    [`%${agency}%`],
  );
  return result.rows as CompetitorMovement[];
}

async function fetchExistingCapturePlan(oppId: string): Promise<CapturePlanData | null> {
  const pool = getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT phase, pwin, bid_decision, win_themes, discriminators,
            teaming_partners, risks
     FROM capture_plans WHERE opportunity_id = $1
     ORDER BY updated_at DESC LIMIT 1`,
    [oppId],
  );
  return result.rows[0] as CapturePlanData | undefined ?? null;
}

async function fetchCachedAnalysis(oppId: string): Promise<CaptureCoachAnalysis | null> {
  const pool = getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT analysis FROM capture_coach_results
     WHERE opportunity_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [oppId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].analysis as CaptureCoachAnalysis;
}

// ---------------------------------------------------------------------------
// AI analysis (ORIENT + DECIDE)
// ---------------------------------------------------------------------------

function buildPrompt(
  opp: OpportunityData,
  company: CompanyProfile | null,
  cpars: CparsRecord[],
  competitors: CompetitorMovement[],
  capturePlan: CapturePlanData | null,
): string {
  const sections: string[] = [];

  sections.push(`## Opportunity
Title: ${opp.title}
Agency: ${opp.agency} (${opp.department ?? "N/A"})
Value: $${opp.value_estimated?.toLocaleString() ?? "TBD"}
NAICS: ${opp.naics ?? "N/A"} | PSC: ${opp.psc ?? "N/A"}
Set-aside: ${opp.set_aside ?? "Full & Open"}
Due date: ${opp.due_date ?? "TBD"}
Solicitation: ${opp.solicitation_number ?? "N/A"}
Incumbent: ${opp.incumbent ?? "Unknown"}
Current Pwin: ${opp.probability_of_win ?? "Not scored"}
Status: ${opp.status}
Tags: ${opp.tags?.join(", ") ?? "None"}`);

  if (company) {
    sections.push(`## Company Profile — ${company.name}
CAGE: ${company.cage_code}
NAICS Codes: ${company.naics_codes?.join(", ") ?? "N/A"}
Set-aside categories: ${company.set_aside_categories?.join(", ") ?? "N/A"}
Capabilities: ${company.capabilities?.join(", ") ?? "N/A"}
Core competencies: ${company.core_competencies?.join(", ") ?? "N/A"}
Past performance: ${company.past_performance_summary ?? "N/A"}`);
  }

  if (cpars.length > 0) {
    sections.push(`## Relevant CPARS (${cpars.length} records)
${cpars.map((c) => `- ${c.contract_name} (${c.agency}): ${c.rating} — ${c.period}`).join("\n")}`);
  }

  if (competitors.length > 0) {
    sections.push(`## Recent Competitor Intel
${competitors.map((c) => `- [${c.threat_level}] ${c.competitor_name}: ${c.title}`).join("\n")}`);
  }

  if (capturePlan) {
    sections.push(`## Existing Capture Plan
Phase: ${capturePlan.phase} | Pwin: ${capturePlan.pwin}% | Decision: ${capturePlan.bid_decision}
Win themes: ${capturePlan.win_themes?.join(", ") ?? "None"}
Discriminators: ${capturePlan.discriminators?.join(", ") ?? "None"}
Teaming: ${capturePlan.teaming_partners?.map((t) => `${t.name} (${t.role})`).join(", ") ?? "None"}
Risks: ${capturePlan.risks?.length ?? 0} identified`);
  }

  return sections.join("\n\n");
}

const SYSTEM_PROMPT = `You are Envision's senior capture manager and AI strategy advisor. Envision Innovative Solutions is a Service-Disabled Veteran-Owned Small Business (SDVOSB) specializing in defense IT, cybersecurity, Army SETA support, and C5ISR systems engineering.

Given the opportunity details, company capabilities, past performance (CPARS), competitive landscape, and existing capture plan (if any), provide a comprehensive capture strategy analysis.

Respond with ONLY valid JSON matching this structure:
{
  "win_probability": {
    "score": <0-100>,
    "confidence": "high|medium|low",
    "factors": [{"factor": "<name>", "impact": "positive|negative|neutral", "detail": "<1-2 sentences>"}]
  },
  "capture_strategy": {
    "approach": "<2-3 sentence strategic approach>",
    "discriminators": ["<key differentiator 1>", "..."],
    "win_themes": ["<theme 1>", "..."],
    "teaming_recommendations": [{"partner_type": "<type>", "rationale": "<why>"}]
  },
  "gap_analysis": [{"gap": "<what's missing>", "severity": "critical|high|medium|low", "mitigation": "<how to address>"}],
  "risk_assessment": [{"risk": "<risk>", "likelihood": "high|medium|low", "impact": "high|medium|low", "mitigation": "<mitigation>"}],
  "next_actions": [{"action": "<specific action>", "priority": "critical|high|medium|low", "owner": "<role>", "timeline": "<when>"}],
  "executive_summary": "<3-5 sentence summary of the capture opportunity and recommended approach>"
}

Be specific, actionable, and grounded in the data provided. Do not invent information not in the context.`;

async function analyzeOpportunity(
  opp: OpportunityData,
  company: CompanyProfile | null,
  cpars: CparsRecord[],
  competitors: CompetitorMovement[],
  capturePlan: CapturePlanData | null,
): Promise<{ analysis: CaptureCoachAnalysis; model: string }> {
  const contextPrompt = buildPrompt(opp, company, cpars, competitors, capturePlan);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextPrompt },
  ];

  // Use "deep" tier (Claude) for strategic analysis, fall back to "fast" (GPT-4o)
  const tier = isDeepModelAvailable() ? "deep" as const : "fast" as const;
  const result = await chatCompletion(messages, { tier });

  let parsed: Omit<CaptureCoachAnalysis, "opportunity_id" | "model_used" | "generated_at">;
  try {
    const cleaned = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    log.warn("capture_coach_parse_error", { raw: result.content.slice(0, 200) });
    throw new Error("Failed to parse AI response as JSON");
  }

  const analysis: CaptureCoachAnalysis = {
    ...parsed,
    opportunity_id: opp.id,
    model_used: result.model,
    generated_at: new Date().toISOString(),
  };

  return { analysis, model: result.model };
}

// ---------------------------------------------------------------------------
// ACT — store results
// ---------------------------------------------------------------------------

async function storeResult(analysis: CaptureCoachAnalysis): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `INSERT INTO capture_coach_results (opportunity_id, analysis, model_used, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [analysis.opportunity_id, JSON.stringify(analysis), analysis.model_used],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function triggerCaptureCoach(
  opportunityId: string,
  trigger: "manual" | "webhook" = "manual",
): Promise<{ result: AgentResult; analysis: CaptureCoachAnalysis }> {
  let analysis: CaptureCoachAnalysis | null = null;

  const agentResult = await runAgent("capture-coach", trigger, async (ctx: AgentContext) => {
    // Step 1: OBSERVE
    const opp = await fetchOpportunity(opportunityId);
    if (!opp) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    if (!isLLMAvailable()) {
      throw new Error("No AI model available. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY.");
    }

    const [company, cpars, competitors, capturePlan] = await Promise.all([
      fetchCompanyProfile(),
      fetchRelevantCpars(opp.agency),
      fetchCompetitorIntel(opp.agency),
      fetchExistingCapturePlan(opportunityId),
    ]);

    // Step 2+3: ORIENT + DECIDE
    const result = await analyzeOpportunity(opp, company, cpars, competitors, capturePlan);
    analysis = result.analysis;

    // Step 4: ACT
    await storeResult(analysis);

    // Queue critical items for approval if win probability is high
    if (analysis.win_probability.score >= 70) {
      await ctx.addApproval({
        type: "capture_strategy",
        title: `Review capture strategy for: ${opp.title}`,
        summary: analysis.executive_summary,
        data: {
          opportunity_id: opportunityId,
          opportunity_title: opp.title,
          win_probability: analysis.win_probability.score,
          agency: opp.agency,
          value: opp.value_estimated,
        },
        priority: analysis.win_probability.score >= 85 ? "critical" : "high",
      });
    }

    const criticalGaps = analysis.gap_analysis.filter((g) => g.severity === "critical");
    if (criticalGaps.length > 0) {
      await ctx.addApproval({
        type: "capture_gap_alert",
        title: `Critical gaps for: ${opp.title}`,
        summary: `${criticalGaps.length} critical gap(s): ${criticalGaps.map((g) => g.gap).join("; ")}`,
        data: { opportunity_id: opportunityId, gaps: criticalGaps },
        priority: "high",
      });
    }

    return {
      items_processed: 1,
      items_flagged: (analysis.win_probability.score >= 70 ? 1 : 0) + (criticalGaps.length > 0 ? 1 : 0),
      summary: {
        opportunity_id: opportunityId,
        opportunity_title: opp.title,
        win_probability: analysis.win_probability.score,
        confidence: analysis.win_probability.confidence,
        gaps_found: analysis.gap_analysis.length,
        critical_gaps: criticalGaps.length,
        risks_found: analysis.risk_assessment.length,
        next_actions: analysis.next_actions.length,
        model: result.model,
      },
    };
  });

  if (!analysis) {
    if (agentResult.summary?.skipped) {
      throw new Error("Capture Coach agent is currently disabled. Enable it in Agent Config.");
    }
    throw new Error("Analysis was not generated");
  }

  return { result: agentResult, analysis };
}

export { fetchCachedAnalysis };
