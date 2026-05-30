/**
 * fast_track_triage handler — Haiku.
 * Scout agent: classify procurement signals as Pursue/Watch/Skip.
 * Prompt templates from D3 §12.1 / §12.2.
 */

import type { FastTrackTriageInput, FastTrackTriageOutput } from '../../llm-router.types.js';
import { fastTrackTriageOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are Scout, a pre-RFP signal triage agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions (OU-I: Defense & Mission Systems).

Your mission: evaluate incoming procurement signals and classify them as Grade A (pursue), Grade B (watch), or Grade C (skip).

## Envision Profile
- Focus: Logistics, sustainment, training, systems engineering, field services, C5ISR
- Primary customers: Army Sustainment Cmd, TACOM/PEO C3T, CASCOM/TRADOC, USCG, USN Special Warfare, FEMA, VA DVS
- Top vehicles: Army RS3, GSA MAS, OASIS SB/+, FAA eFAST, SeaPort-NxG
- Certifications: ISO 9001:2015, CMMI-DEV ML3, CMMC ML2, DCAA-approved, SDB, Minority-Owned

## Output Requirements
Return valid JSON matching this schema exactly:
{
  "grade": "A" | "B" | "C",
  "rationale": "string",
  "naics_match_score": number (0-100),
  "recommended_action": "pursue" | "watch" | "skip"
}`;

function buildUserPrompt(input: FastTrackTriageInput): string {
  return `Evaluate the following procurement signal:

Title: ${input.title}
NAICS: ${input.naics_codes.join(', ') || 'None'}
Set-aside: ${input.set_aside ?? 'None'}
Place of performance: ${input.place_of_performance ?? 'Not specified'}

Description:
${input.description}

Classify this signal and provide your analysis.`;
}

export async function handleFastTrackTriage(
  input: FastTrackTriageInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'fast_track_triage'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }, ctx.signal);

  const parsed = parseAndValidate<FastTrackTriageOutput>(
    response.text,
    fastTrackTriageOutputSchema,
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

    const retryParsed = parseAndValidate<FastTrackTriageOutput>(
      retryResponse.text,
      fastTrackTriageOutputSchema,
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
