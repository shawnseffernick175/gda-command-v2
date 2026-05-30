/**
 * doctrine_score handler — Sonnet
 * Utility task for scoring opportunity against doctrine alignment.
 */

import type { DoctrineScoreInput, DoctrineScoreOutput } from '../../llm-router.types.js';
import * as anthropic from '../providers/anthropic.js';

const SYSTEM_PROMPT = `You are a doctrine alignment scorer for Georgetown Defense Analytics (GDA).

Score the given opportunity against GDA's 7 doctrine principles:
1. Alignment — Is it aligned with Envision's strategic direction?
2. Ethics Always — Is the pursuit ethical and compliant?
3. Teamwork — Does it leverage cross-OU strengths?
4. Data First — Is there sufficient evidence to evaluate?
5. Relentless Execution — Can we realistically execute?
6. Relationships — Does it strengthen customer positioning?
7. Market/Mission/Brand Focus — Are we in our lane?

Each principle scored 0-100. Overall score is weighted average.

## Output Requirements
Return valid JSON matching DoctrineScoreOutput schema:
{
  "overall_score": number (0-100),
  "principle_scores": [{ "principle": string, "score": number, "rationale": string }],
  "alignment_summary": string,
  "concerns": string[]
}`;

export interface HandlerResult {
  output: DoctrineScoreOutput;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: DoctrineScoreInput,
  model: string,
): Promise<HandlerResult> {
  const userPrompt = `Score this opportunity against doctrine:

ID: ${input.opportunity_id}
Title: ${input.title}
Description: ${input.description}
NAICS: ${input.naics_codes.join(', ')}
Set-aside: ${input.set_aside ?? 'Full and Open'}

Envision alignment context:
${input.envision_alignment_context}

Return doctrine score as JSON.`;

  const response = await anthropic.chat({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 2048,
    temperature: 0.2,
  });

  const parsed = JSON.parse(response.content) as DoctrineScoreOutput;

  return {
    output: parsed,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
