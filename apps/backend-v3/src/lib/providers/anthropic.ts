/**
 * Provider adapter — Anthropic (Claude)
 *
 * Handles: fast_track_triage, opportunity_analysis, capture_plan,
 * daily_briefing, sentinel_summary, doctrine_score.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Task, TaskInputMap, TaskOutputMap, BlackHatAnalysisInput, RiskGenerationInput } from '../llm-router.types.js';

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

  opportunity_analysis: `You are Envision's senior capture manager. Analyze this federal opportunity and return a structured Shipley-based assessment. Return JSON exactly matching OpportunityAnalysisOutput: win_probability 0-100, ShipleyScore across 4 dimensions 1-10, incumbent profile if detectable, up to 3 competitors, doctrine alignment across 7 principles, source_chips with URL for every factual claim.`,

  doctrine_score: `You are a doctrine alignment scorer for Envision. Score this opportunity against Envision's 7 Operating Principles: 1=Mission Focus, 2=Technical Excellence, 3=Trusted Partner, 4=Veteran Commitment, 5=Innovation, 6=Compliance, 7=Value Delivery. Return DoctrineScoreOutput with overall_score 0-40, per-principle scores, alignment_summary, and concerns list.`,

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

  risk_generation: `You are a risk analyst specializing in federal government contracting proposals. Generate a comprehensive set of bid/performance risks for the given opportunity.`,
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
      "rationale": "<why this risk applies to this specific opportunity>"
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
  const systemPrompt = SYSTEM_PROMPTS[opts.task] ?? 'Return valid JSON matching the requested output schema.';

  const userContent = opts.task === 'black_hat_analysis'
    ? buildBlackHatUserPrompt(opts.input as BlackHatAnalysisInput)
    : opts.task === 'risk_generation'
    ? buildRiskGenerationPrompt(opts.input as RiskGenerationInput)
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

/** Reset client (for testing). */
export function resetAnthropicClient(): void {
  client = null;
}
