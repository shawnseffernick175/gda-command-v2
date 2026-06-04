/**
 * Provider adapter — Anthropic (Claude)
 *
 * Handles: fast_track_triage, opportunity_analysis, capture_plan,
 * daily_briefing, sentinel_summary, doctrine_score.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Task, TaskInputMap, TaskOutputMap } from '../llm-router.types.js';

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

  daily_briefing: `You are the GDA Command daily briefing generator for Envision. Summarize today's intelligence: priority actions, risk flags, market intel, and certification warnings. Return JSON matching DailyBriefingOutput.`,

  sentinel_summary: `You are a system health analyst for GDA Command. Analyze this alert and determine severity, root cause, recommended fix, and affected components. Return JSON matching SentinelSummaryOutput.`,
};

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

  const userContent = JSON.stringify(opts.input);

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

/** Reset client (for testing). */
export function resetAnthropicClient(): void {
  client = null;
}
