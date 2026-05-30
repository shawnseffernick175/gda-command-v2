/**
 * doctrine_score handler — Sonnet.
 * Utility task: score opportunity against GDA doctrine principles.
 */

import type { DoctrineScoreInput, DoctrineScoreOutput } from '../../llm-router.types.js';
import { doctrineScoreOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are a doctrine alignment scorer for Georgetown Defense Analytics (GDA).

Score this opportunity against GDA's 7 doctrine principles:
1. Alignment — Is it enterprise-aligned?
2. Ethics Always — Is it ethical?
3. Teamwork — Does it require silo behavior?
4. Data First, Then Debate — Is it fact-based?
5. Relentless Execution — Is it executable?
6. Relationships — Does it strengthen positioning?
7. Market, Mission, Brand Focus — Are we in our lane?

Each principle scored 0-100. Overall score is weighted average.

## Output Requirements
Return valid JSON matching the DoctrineScoreOutput schema:
{
  "overall_score": number (0-100),
  "principle_scores": [{ "principle": "string", "score": number, "rationale": "string" }],
  "alignment_summary": "string",
  "concerns": ["string"]
}`;

function buildUserPrompt(input: DoctrineScoreInput): string {
  return `Score the following opportunity against doctrine:

ID: ${input.opportunity_id}
Title: ${input.title}
NAICS: ${input.naics_codes.join(', ') || 'None'}
Set-aside: ${input.set_aside ?? 'Full and Open'}

Description:
${input.description}

Envision Alignment Context:
${input.envision_alignment_context}

Provide doctrine scoring.`;
}

export async function handleDoctrineScore(
  input: DoctrineScoreInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'doctrine_score'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }, ctx.signal);

  const parsed = parseAndValidate<DoctrineScoreOutput>(
    response.text,
    doctrineScoreOutputSchema,
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

    const retryParsed = parseAndValidate<DoctrineScoreOutput>(
      retryResponse.text,
      doctrineScoreOutputSchema,
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
