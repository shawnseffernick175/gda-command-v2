/**
 * capture_plan handler — Opus.
 * Coach agent: Shipley-anchored capture plan.
 * Returns CapturePlanOutput (D3 §5.5 CoachOutput).
 * Prompt templates from D3 §12.5 / §12.6.
 */

import type { CapturePlanInput, CapturePlanOutput } from '../../llm-router.types.js';
import { capturePlanOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are Coach, a capture strategy advisor for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: generate a comprehensive Shipley-anchored capture plan that prepares Envision to win this pursuit.

## Shipley Methodology Anchoring
Your capture plan must follow the Shipley capture planning framework:
1. Customer Profile — who is the buyer, what do they care about?
2. Requirements Summary — distill the key requirements.
3. Solution Strategy — how Envision will solve this.
4. Win Themes — 3-5 compelling themes that differentiate Envision.
5. Ghost Themes — themes designed to position against specific competitors.
6. Discriminators — concrete Envision differentiators.
7. Pricing Strategy — approach to pricing within doctrine guardrails.
8. Teaming Plan — if teaming with Riverstone or PD Systems is recommended.

## Color Review Preparation
- Pink Hat Gaps: what is missing before the proposal can pass Pink Team review?
- Red Team Weaknesses: what will Red Team find? Proactively address.
- Gold Team Readiness: is the proposal submit-ready? Checklist.

## Source Citation Rule (R1 — binding)
Every factual claim MUST include a source_chip with label, url, kind, retrieved_at.

## Output Requirements
Return valid JSON matching the CapturePlanOutput schema exactly.`;

function buildUserPrompt(input: CapturePlanInput): string {
  const sourcesStr = input.sources.length > 0
    ? input.sources.map((s) => `- [${s.kind}] ${s.title}: ${s.url}`).join('\n')
    : 'No sources available';

  return `Generate a capture plan for the following opportunity:

## Opportunity
ID: ${input.opportunity_id}
Title: ${input.title}
Solicitation: ${input.solicitation_number ?? 'N/A'}

## Description
${input.description}

## Analysis Summary
${input.analysis_summary}

## Incumbent
${input.incumbent_info ?? 'No incumbent data available'}

## Competitor Landscape
${input.competitor_landscape ?? 'No competitive intelligence available'}

## Envision Capabilities
${input.envision_capabilities.join(', ') || 'General capabilities'}

## Teaming Partners
${input.teaming_partners.join(', ') || 'None identified'}

## Sources
${sourcesStr}

Generate the comprehensive capture plan.`;
}

export async function handleCapturePlan(
  input: CapturePlanInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'capture_plan'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 8192,
  }, ctx.signal);

  const parsed = parseAndValidate<CapturePlanOutput>(
    response.text,
    capturePlanOutputSchema,
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
      max_tokens: 8192,
    }, ctx.signal);

    const retryParsed = parseAndValidate<CapturePlanOutput>(
      retryResponse.text,
      capturePlanOutputSchema,
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
