/**
 * daily_briefing handler — Sonnet.
 * Commander agent: synthesize daily "What Needs Me Today" briefing.
 * Prompt templates from D3 §12.9 / §12.10.
 */

import type { DailyBriefingInput, DailyBriefingOutput } from '../../llm-router.types.js';
import { dailyBriefingOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are Commander, the daily briefing agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: synthesize all active pursuits, captures, action items, and system health into a prioritized "What Needs Me Today" briefing for the operator (Shawn).

## Briefing Rules
1. Surface 3-5 priority actions, ranked by urgency.
2. Each action must reference a specific object (opportunity, capture, action item, etc.).
3. Include risk flags and cert expiration warnings.
4. Include market intelligence summary.

## Doctrine Anchoring
- Principle 5 (Relentless Execution): every decision has a deadline and owner.
- Principle 4 (Data First): every claim references a source.
- Principle 1 (Alignment): decisions are ranked by strategic value, not recency.

## Output Requirements
Return valid JSON matching the DailyBriefingOutput schema exactly.`;

function buildUserPrompt(input: DailyBriefingInput): string {
  const oppsStr = input.open_opportunities.length > 0
    ? input.open_opportunities.map((o) =>
        `- [${o.opportunity_id}] ${o.title} — due ${o.response_deadline ?? 'No deadline'} — pwin: ${o.pwin ?? 'N/A'}% — grade: ${o.grade}`
      ).join('\n')
    : 'No open opportunities';

  const capturesStr = input.captures_with_gaps.length > 0
    ? input.captures_with_gaps.map((c) =>
        `- [${c.capture_id}] ${c.opportunity_title} — stage: ${c.color_review_stage} — gaps: ${c.gaps.join(', ') || 'none'}`
      ).join('\n')
    : 'No captures with gaps';

  const actionsStr = input.action_items_due.length > 0
    ? input.action_items_due.map((a) =>
        `- [${a.id}] ${a.title} — due ${a.due_date} — ${a.urgency}`
      ).join('\n')
    : 'No action items due';

  const pipelineStr = input.pipeline_at_risk.length > 0
    ? input.pipeline_at_risk.map((p) =>
        `- [${p.opportunity_id}] ${p.opportunity_title} — milestone: ${p.milestone} — target: ${p.target_date} — risk: ${p.risk_reason}`
      ).join('\n')
    : 'No pipeline items at risk';

  const certsStr = input.expiring_certs.length > 0
    ? input.expiring_certs.map((c) =>
        `- ${c.cert_name} — expires ${c.expiration_date} (${c.days_remaining} days) — ${c.severity}`
      ).join('\n')
    : 'No expiring certs';

  return `Generate today's briefing for ${input.date}.

## Open Opportunities
${oppsStr}

## Captures with Gaps
${capturesStr}

## Action Items Due
${actionsStr}

## Sentinel Status
Overall: ${input.sentinel_status.overall_health}
Last check: ${input.sentinel_status.last_check_at}
Active alerts: ${input.sentinel_status.active_alerts.length}

## Pipeline at Risk
${pipelineStr}

## Expiring Certifications
${certsStr}

## Pending Recommendations
${input.pending_recommendations.length} pending

Generate the prioritized briefing.`;
}

export async function handleDailyBriefing(
  input: DailyBriefingInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'daily_briefing'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }, ctx.signal);

  const parsed = parseAndValidate<DailyBriefingOutput>(
    response.text,
    dailyBriefingOutputSchema,
  );

  if (!parsed.ok) {
    const retryResponse = await ctx.provider.chat({
      model: ctx.model,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: response.text },
        { role: 'user', content: `Your output failed schema validation: ${parsed.error}\n\nPlease return valid JSON matching the required schema.` },
      ],
    }, ctx.signal);

    const retryParsed = parseAndValidate<DailyBriefingOutput>(
      retryResponse.text,
      dailyBriefingOutputSchema,
    );

    if (!retryParsed.ok) {
      const err = new Error(`INVALID_OUTPUT: ${retryParsed.error}`);
      (err as NodeJS.ErrnoException).code = 'INVALID_OUTPUT';
      throw err;
    }

    return {
      output: retryParsed.data,
      tokens_in: response.tokens_in + retryResponse.tokens_in,
      tokens_out: response.tokens_out + retryResponse.tokens_out,
      model_used: retryResponse.model,
    };
  }

  return {
    output: parsed.data,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
