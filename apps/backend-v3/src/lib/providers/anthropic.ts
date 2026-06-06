/**
 * Provider adapter — Anthropic (Claude)
 *
 * Handles: fast_track_triage, opportunity_analysis, capture_plan,
 * daily_briefing, sentinel_summary, doctrine_score.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Task, TaskInputMap, TaskOutputMap, BlackHatAnalysisInput, RiskGenerationInput, AwardAnalysisInput, CompetitorAnalysisInput, ContactEnrichInput, MatchAnalysisInput } from '../llm-router.types.js';
import { getStoredPrompt } from '../prompt-store.js';

/** Map from task to prompt_library key for read-through lookup. */
const TASK_PROMPT_KEY: Partial<Record<Task, string>> = {
  opportunity_analysis: 'opportunity_analysis',
  risk_generation: 'risk_generation',
  fast_track_triage: 'fast_track_triage',
  black_hat_analysis: 'competitor_black_hat',
  daily_briefing: 'daily_briefing',
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw Object.assign(new Error('ANTHROPIC_API_KEY not configured'), { status: 401 });
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** System prompts per D4 task spec. */
const SYSTEM_PROMPTS: Partial<Record<Task, string>> = {
  fast_track_triage: `You are an expert government contracting analyst for Envision, a defense/DoD services company based in Alexandria VA. Evaluate this solicitation and assign a triage grade. Return JSON exactly matching FastTrackTriageOutput: grade (A=strong fit, B=potential, C=weak), rationale (2-3 sentences), naics_match_score (0-100, our codes are 541330/541512/541611), recommended_action (pursue/watch/skip).`,

  opportunity_analysis: `You are Envision's senior capture manager. Analyze this federal opportunity and return a structured Shipley-based assessment. Return JSON exactly matching OpportunityAnalysisOutput: win_probability 0-100, ShipleyScore across 4 dimensions 1-10, incumbent profile if detectable, up to 3 competitors, doctrine alignment across 7 principles, source_chips with URL for every factual claim.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  doctrine_score: `You are a doctrine alignment scorer for Envision. Score this opportunity against Envision's 7 Operating Principles: 1=Mission Focus, 2=Technical Excellence, 3=Trusted Partner, 4=Veteran Commitment, 5=Innovation, 6=Compliance, 7=Value Delivery. Return DoctrineScoreOutput with overall_score 0-40, per-principle scores, alignment_summary, and concerns list.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  capture_plan: `You are Envision's capture strategist. Generate a comprehensive capture plan following Shipley methodology. Include win themes, ghost themes, teaming plan, pink/red/gold/black hat analysis, and next actions. Return JSON matching CapturePlanOutput.`,

  daily_briefing: `You are the GDA Command daily briefing generator for Envision. Analyze the input data and return ONLY a JSON object with this exact schema (no extra keys, no markdown):
{
  "headline": "<1-sentence summary of today's top priority>",
  "priority_actions": [
    { "action": "<what to do>", "urgency": "immediate" | "today" | "this_week", "related_entity": "<opportunity title or null>" }
  ],
  "risk_flags": ["<risk string>"],
  "market_intel_summary": "<paragraph of market intelligence>",
  "cert_expiration_warnings": ["<warning string>"]
}
All fields are required. urgency must be one of: immediate, today, this_week.`,

  sentinel_summary: `You are a system health analyst for GDA Command. Analyze this alert and determine severity, root cause, recommended fix, and affected components. Return JSON matching SentinelSummaryOutput.`,


  black_hat_analysis: `You are a competitive intelligence analyst specializing in federal government contracting. Perform Black Hat analysis viewing competition from the competitor's perspective.`,

  risk_generation: `You are a risk analyst specializing in federal government contracting proposals. Generate a comprehensive set of bid/performance risks for the given opportunity. Include both negative risks (threats) and positive risks (opportunities to exploit). Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly. Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  award_analysis: `You are a sharp defense contracting analyst briefing an executive at Envision (federal IT/consulting, NAICS 541511/541512/541519/541690, based in Alexandria VA). Analyze this USAspending award and return a structured assessment.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  contact_enrich: `You are an intelligence analyst building a relationship profile for a defense contracting firm.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.`,

  competitor_analysis: `Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.

You are analyzing a competitor in the federal IT/consulting market relative to Envision (NAICS 541511/541512/541519/541690, 8(a) eligible small business specializing in digital transformation and data analytics for DoD/federal agencies). Classify this competitor and provide actionable intelligence.`,

  match_analysis: `You are a senior capture strategist at Envision, a defense IT and systems integration firm (NAICS: 541511, 541512, 541519, 541690).

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.`,
};

function buildRiskGenerationPrompt(input: RiskGenerationInput): string {
  const desc = input.opportunity_description.slice(0, 800);
  const naics = input.naics_codes.join(', ') || 'N/A';
  const existing = input.existing_risks.length > 0 ? input.existing_risks.join('; ') : 'None';
  return `Generate risks for this federal opportunity:
Title: ${input.opportunity_title}
Agency: ${input.agency ?? 'Unknown'}
Description: ${desc}
NAICS: ${naics}
Set-aside: ${input.set_aside ?? 'None'}
Deadline: ${input.response_deadline ?? 'Unknown'}

Existing risks to avoid duplicating: ${existing}

Generate 4-6 distinct risks covering technical, schedule, financial, competitive, and compliance dimensions.
Include both negative risks (threats — things that could go wrong) and positive risks (opportunities — favorable conditions to exploit).

For each risk provide:
- risk_type: "negative" for threats, "positive" for opportunities
- if_condition: the trigger — "If this happens…"
- then_impact: the downstream effect — "…then this occurs."
- mitigation_plan: (negative risks only) specific actions to reduce likelihood or impact
- exploitation_plan: (positive risks only) how to capitalize on the opportunity

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.

Respond ONLY with valid JSON:
{
  "risks": [
    {
      "title": "<concise risk title>",
      "description": "<1-2 sentence description>",
      "category": "<technical|schedule|financial|compliance|operational|competitive>",
      "likelihood": <1-5>,
      "impact": <1-5>,
      "mitigation": "<1-2 sentence mitigation approach>",
      "rationale": "<why this risk applies to this specific opportunity>",
      "risk_type": "<negative|positive>",
      "if_condition": "<trigger condition>",
      "then_impact": "<downstream effect>",
      "mitigation_plan": "<for negative risks — actions to reduce likelihood/impact>",
      "exploitation_plan": "<for positive risks — how to capitalize>"
    }
  ],
  "generation_summary": "<1 sentence summary>",
  "generated_at": "<ISO 8601>"
}`;
}

export interface AnthropicCallResult {
  text: string;
  tokens_input: number;
  tokens_output: number;
  model: string;
}

/**
 * Call Anthropic Claude with structured output.
 * Throws on HTTP errors with status code attached.
 */
export async function callAnthropic(opts: {
  model: string;
  task: Task;
  input: unknown;
  timeout_ms: number;
}): Promise<AnthropicCallResult> {
  const anthropic = getClient();

  // Read-through: check prompt_library first, fall back to hard-coded default
  const promptKey = TASK_PROMPT_KEY[opts.task];
  const stored = promptKey ? await getStoredPrompt(promptKey) : null;
  const systemPrompt = stored?.system_prompt ?? SYSTEM_PROMPTS[opts.task] ?? 'Return valid JSON matching the requested output schema.';

  const userContent = opts.task === 'black_hat_analysis'
    ? buildBlackHatUserPrompt(opts.input as BlackHatAnalysisInput)
    : opts.task === 'risk_generation'
    ? buildRiskGenerationPrompt(opts.input as RiskGenerationInput)
    : opts.task === 'award_analysis'
    ? buildAwardAnalysisPrompt(opts.input as AwardAnalysisInput)
    : opts.task === 'competitor_analysis'
    ? buildCompetitorAnalysisPrompt(opts.input as CompetitorAnalysisInput)
    : opts.task === 'contact_enrich'
    ? buildContactEnrichPrompt(opts.input as ContactEnrichInput)
    : opts.task === 'match_analysis'
    ? buildMatchAnalysisPrompt(opts.input as MatchAnalysisInput)
    : JSON.stringify(opts.input);

  try {
    const response = await anthropic.messages.create(
      {
        model: opts.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      },
      { timeout: opts.timeout_ms },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';

    return {
      text,
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      model: response.model,
    };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { type?: string } };
    const status = e.status ?? 500;
    throw Object.assign(new Error(e.message ?? 'Anthropic API error'), {
      status,
      code: status >= 500 ? 'PROVIDER_5XX' : undefined,
    });
  }
}

function buildBlackHatUserPrompt(input: BlackHatAnalysisInput): string {
  return `Perform Black Hat Analysis for: ${input.competitor_name}

USAspending.gov data:
- Win count: ${input.competitor_wins}
- Total obligated: $${input.competitor_total_obligated}
- Agencies: ${input.competitor_agencies.join(', ')}
- NAICS: ${input.competitor_naics.join(', ')}
- Contract types: ${input.competitor_contract_types.join(', ')}

Our context: ${input.envision_context}

Respond ONLY with valid JSON:
{
  "competitor": "<name>",
  "likely_approach": "<2-3 sentences on their positioning>",
  "strengths": ["<3-5 specific strengths>"],
  "weaknesses": ["<3-5 specific weaknesses>"],
  "counter_strategy": "<2-3 sentences how Envision counters>",
  "intel_summary": "<1-2 sentence summary>",
  "generated_at": "<ISO 8601>"
}`;
}

function buildAwardAnalysisPrompt(input: AwardAnalysisInput): string {
  const value = input.value_obligated !== null
    ? `$${(input.value_obligated / 1_000_000).toFixed(2)}M`
    : 'Unknown';
  return `Analyze this federal contract award:

Recipient: ${input.recipient_name ?? 'Unknown'}
Agency: ${input.agency_name ?? 'Unknown'}
NAICS: ${input.naics ?? 'Unknown'}
Set-aside: ${input.set_aside ?? 'None'}
Contract type: ${input.contract_type ?? 'Unknown'}
Award value: ${value}
Award date: ${input.award_date ?? 'Unknown'}
Period of performance end: ${input.period_of_performance_end ?? 'Unknown'}

Envision's NAICS codes: 541511, 541512, 541519, 541690

Respond ONLY with valid JSON:
{
  "win_rationale": "<one to two sentence explanation of why this recipient likely won>",
  "agency_signal": "<one sentence on what this award reveals about the agency's priorities>",
  "recompete_assessment": "<one sentence — is this a re-compete opportunity for Envision, and when does it expire?>",
  "winner_classification": "THREAT | PARTNER | IRRELEVANT",
  "recommended_action": "Pursue Re-Compete | Monitor | Pass | Partner with Winner",
  "so_what": "<two to three sentence analyst summary paragraph>"
}`;
}

function buildCompetitorAnalysisPrompt(input: CompetitorAnalysisInput): string {
  const recompetes = input.recompete_contracts.length > 0
    ? input.recompete_contracts.map((r) => `  - ${r.title} (${r.agency}, $${(r.value / 1_000_000).toFixed(2)}M, expires ${r.expiration_date})`).join('\n')
    : '  None identified';
  return `Analyze this competitor:

Company: ${input.competitor_name}
UEI: ${input.awardee_uei ?? 'Unknown'}
Win count: ${input.win_count}
Total obligated: $${(input.total_obligated / 1_000_000).toFixed(2)}M
Agencies: ${input.agencies.join(', ') || 'Unknown'}
NAICS codes: ${input.naics_codes.join(', ') || 'Unknown'}
Set-aside types: ${input.set_asides.join(', ') || 'None'}
Contract types: ${input.contract_types.join(', ') || 'Unknown'}

Re-compete contracts (expiring within 18 months):
${recompetes}

Our context: ${input.envision_context}

Derive size_classification from NAICS codes, set-aside types, and contract volume. If data is insufficient, set to "Unknown".

Respond ONLY with valid JSON:
{
  "size_classification": "Large Business | Small Business | SDVOSB | 8(a) | HUBZone | WOSB | Unknown",
  "classification": "THREAT | PARTNER | MONITOR",
  "classification_rationale": "<one sentence>",
  "so_what": "<two to three sentence analyst paragraph>",
  "recompete_contracts": [],
  "recommended_action": "Compete | Partner | Monitor | Ignore",
  "trend": "Up | Down | Flat"
}`;
}

function buildContactEnrichPrompt(input: ContactEnrichInput): string {
  return `Contact:
- Name: ${input.name}
- Title: ${input.title ?? 'Unknown'}
- Agency/Company: ${input.agency_or_company ?? 'Unknown'}
- Category: ${input.category}
- Email: ${input.email ?? 'Unknown'}
- LinkedIn: ${input.linkedin ?? 'N/A'}
- Notes: ${input.notes ?? 'None'}

Based on this contact's role and organization, provide:

Respond ONLY with valid JSON:
{
  "role_summary": "<1 sentence on what this person does and why they matter>",
  "procurement_influence": "high | medium | low | unknown",
  "likely_decision_authority": "<What procurement decisions this person likely influences>",
  "engagement_approach": "<Recommended first engagement action for Envision>",
  "relevance_to_envision": "<Why Envision should track this contact specifically>",
  "model_used": "<model>"
}`;
}

function buildMatchAnalysisPrompt(input: MatchAnalysisInput): string {
  return `Technology signal: ${input.tech_title} (source: ${input.tech_source})
Requirement signal: ${input.req_title} (source: ${input.req_source})
Match scores: Mission Fit ${Math.round(input.mission_fit * 100)}%, Technical Fit ${Math.round(input.technical_fit * 100)}%, Timing ${Math.round(input.timing * 100)}%
Recommended vehicle: ${input.recommended_vehicle ?? 'Not yet determined'}

Analyze Envision's broker role — how can Envision bridge this technology to this requirement?
Return ONLY valid JSON:
{
  "broker_role": "1-2 sentences on Envision's exact bridging role",
  "gap_analysis": "What technical or programmatic gaps remain between the tech and the requirement",
  "recommended_actions": [
    {"action": "...", "priority": "high|medium|low", "vehicle": "..."}
  ],
  "risk_flags": [
    {"risk": "...", "severity": "high|medium|low"}
  ],
  "envision_fit": "Why Envision specifically — not a generic contractor",
  "ai_narrative": "3-4 sentence executive brief on this match and Envision's play",
  "model_used": "${input.tech_source}"
}`;
}

/** Reset client (for testing). */
export function resetAnthropicClient(): void {
  client = null;
}
