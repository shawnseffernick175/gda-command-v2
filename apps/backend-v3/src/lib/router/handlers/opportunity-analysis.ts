/**
 * opportunity_analysis handler — Sonnet (R2-enforced, 10s wall-clock).
 * Analyst agent: comprehensive bid/no-bid analysis per D3 §4.5 / D4-PATCH.
 */

import type { OpportunityAnalysisInput, OpportunityAnalysisOutput } from '../../llm-router.types.js';
import { opportunityAnalysisOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are Analyst, an opportunity analysis agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: provide a comprehensive bid/no-bid analysis for a government contracting opportunity using Shipley methodology.

## Analysis Requirements
1. Win Probability (0-100) with detailed reasoning.
2. Shipley Bid/No-Bid assessment with 4 scored dimensions (customer_knowledge, solution_match, competitive_position, past_performance), each 1-10 with reasoning and evidence.
3. Incumbent Profile: Who currently holds this work? Include contract details and CPAR signals.
4. Competitive Landscape: Who else will bid? For each competitor, include strengths, weaknesses, and our differentiator.
5. Doctrine Alignment: Score all 7 GDA doctrine principles (Strong/Moderate/Weak/N/A).
6. Source Citations: Every factual claim MUST include a source chip with URL.

## Envision Profile
- Focus: Logistics, sustainment, training, systems engineering, field services, C5ISR
- Primary customers: Army Sustainment Cmd, TACOM/PEO C3T, CASCOM/TRADOC, USCG, USN Special Warfare, FEMA, VA DVS
- Top vehicles: Army RS3, GSA MAS, OASIS SB/+, FAA eFAST, SeaPort-NxG
- Certifications: ISO 9001:2015, CMMI-DEV ML3, CMMC ML2, DCAA-approved, SDB, Minority-Owned

## Source Citation Rule (R1 — binding)
Every factual claim MUST include evidence. Claims without sources are forbidden.

## Output Requirements
Return valid JSON matching the OpportunityAnalysisOutput schema exactly. Do not add fields. Do not omit required fields.`;

function buildUserPrompt(input: OpportunityAnalysisInput): string {
  const sourcesStr = input.sources.length > 0
    ? input.sources.map((s) => `- [${s.kind}] ${s.title}: ${s.url}`).join('\n')
    : 'No sources available';

  return `Analyze the following opportunity for Envision Innovative Solutions:

## Opportunity
ID: ${input.opportunity_id}
Title: ${input.title}
Solicitation: ${input.solicitation_number ?? 'N/A'}
NAICS: ${input.naics_codes.join(', ') || 'None'}
Set-aside: ${input.set_aside ?? 'Full and Open'}
Place of performance: ${input.place_of_performance ?? 'Not specified'}
Response deadline: ${input.response_deadline ?? 'Not specified'}

## Description
${input.description}

## Incumbent Data
${input.incumbent_info ?? 'No incumbent data available'}

## Sources
${sourcesStr}

Provide your complete analysis.`;
}

export async function handleOpportunityAnalysis(
  input: OpportunityAnalysisInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'opportunity_analysis'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }, ctx.signal);

  const parsed = parseAndValidate<OpportunityAnalysisOutput>(
    response.text,
    opportunityAnalysisOutputSchema,
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

    const retryParsed = parseAndValidate<OpportunityAnalysisOutput>(
      retryResponse.text,
      opportunityAnalysisOutputSchema,
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
