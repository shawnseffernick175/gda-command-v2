/**
 * daily_briefing handler — Sonnet
 * Commander per D3 §7 / §12.9-12.10
 */

import type { DailyBriefingInput, DailyBriefingOutput } from '../../llm-router.types.js';
import * as anthropic from '../providers/anthropic.js';

const SYSTEM_PROMPT = `You are Commander, the daily briefing agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: synthesize all active pursuits, captures, action items, and system health into a prioritized "What Needs Me Today" briefing for the operator (Shawn).

## Briefing Rules
1. Surface 3-5 priority actions, ranked by urgency.
2. Each action must reference a specific object.
3. Include risk flags and cert expiration warnings.
4. Keep the headline under 100 characters.

## Source Citation Rule (R1 — binding)
Every factual claim must reference a source.

## Output Requirements
Return valid JSON matching DailyBriefingOutput schema.`;

export interface CorrectionContext {
  previousResponse: string;
  validationError: string;
}

export interface HandlerResult {
  output: DailyBriefingOutput;
  raw_content: string;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: DailyBriefingInput,
  model: string,
  correction?: CorrectionContext,
): Promise<HandlerResult> {
  const oppsText = input.open_opportunities
    .map((o) => `- [${o.opportunity_id}] ${o.title} — due ${o.response_deadline ?? 'N/A'} — pwin: ${o.pwin ?? 'N/A'}% — grade: ${o.grade}`)
    .join('\n');

  const capturesText = input.captures_with_gaps
    .map((c) => `- [${c.capture_id}] ${c.opportunity_title} — stage: ${c.color_review_stage} — gaps: ${c.gaps.join(', ') || 'none'}`)
    .join('\n');

  const actionsText = input.action_items_due
    .map((a) => `- [${a.id}] ${a.title} — due ${a.due_date} — urgency: ${a.urgency}`)
    .join('\n');

  const certsText = input.expiring_certs
    .map((c) => `- ${c.cert_name} — expires ${c.expiration_date} (${c.days_remaining} days) — ${c.severity}`)
    .join('\n');

  const userPrompt = `Generate today's briefing for ${input.date}.

## Open Opportunities
${oppsText || 'None'}

## Active Captures with Gaps
${capturesText || 'None'}

## Action Items Due
${actionsText || 'None'}

## Sentinel Status
Overall: ${input.sentinel_status.overall_health}
Active alerts: ${input.sentinel_status.active_alerts.length}
Last check: ${input.sentinel_status.last_check_at}

## Pending Recommendations
${input.pending_recommendations.map((r) => `- [${r.agent}] ${r.recommendation} (confidence: ${r.confidence}%)`).join('\n') || 'None'}

## Pipeline at Risk
${input.pipeline_at_risk.map((p) => `- [${p.opportunity_id}] ${p.opportunity_title} — milestone: ${p.milestone} — target: ${p.target_date} — risk: ${p.risk_reason}`).join('\n') || 'None'}

## Expiring Certifications
${certsText || 'None'}

Generate the prioritized briefing as JSON.`;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: userPrompt },
  ];

  if (correction) {
    messages.push(
      { role: 'assistant', content: correction.previousResponse },
      {
        role: 'user',
        content: `Your previous response failed schema validation with the following errors:\n\n${correction.validationError}\n\nPlease return a valid response matching the schema exactly. Do not add fields. Do not omit required fields. Return only the JSON object, no commentary.`,
      },
    );
  }

  const response = await anthropic.chat({
    model,
    system: SYSTEM_PROMPT,
    messages,
    max_tokens: 2048,
    temperature: 0.3,
  });

  const parsed = JSON.parse(response.content) as DailyBriefingOutput;

  return {
    output: parsed,
    raw_content: response.content,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
