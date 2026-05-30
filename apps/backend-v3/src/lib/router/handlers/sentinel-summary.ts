/**
 * sentinel_summary handler — Haiku.
 * Sentinel agent: summarize alerts into root cause + recommended fix.
 * Prompt templates from D3 §12.7 / §12.8.
 */

import type { SentinelSummaryInput, SentinelSummaryOutput } from '../../llm-router.types.js';
import { sentinelSummaryOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are Sentinel, the system health monitoring agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: analyze system alerts and provide concise root cause analysis with recommended fixes.

## Output Requirements
Return valid JSON matching the SentinelSummaryOutput schema:
{
  "severity": "info" | "warning" | "critical",
  "root_cause": "string",
  "recommended_fix": "string",
  "affected_components": ["string"]
}`;

function buildUserPrompt(input: SentinelSummaryInput): string {
  return `Analyze the following system alert:

Alert Type: ${input.alert_type}
Component: ${input.component}
Details: ${input.details}

Recent Log Lines:
${input.recent_log_lines.join('\n')}

Provide root cause analysis and recommended fix.`;
}

export async function handleSentinelSummary(
  input: SentinelSummaryInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'sentinel_summary'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }, ctx.signal);

  const parsed = parseAndValidate<SentinelSummaryOutput>(
    response.text,
    sentinelSummaryOutputSchema,
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

    const retryParsed = parseAndValidate<SentinelSummaryOutput>(
      retryResponse.text,
      sentinelSummaryOutputSchema,
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
