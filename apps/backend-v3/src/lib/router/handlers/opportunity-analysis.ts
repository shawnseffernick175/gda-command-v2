/**
 * opportunity_analysis handler — Sonnet (R2-enforced, 10s wall-clock)
 * Analyst per D3 §4 / §12.3-12.4
 */

import type { OpportunityAnalysisInput, OpportunityAnalysisOutput } from '../../llm-router.types.js';
import * as anthropic from '../providers/anthropic.js';

const SYSTEM_PROMPT = `You are Analyst, an opportunity analysis agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: provide a comprehensive bid/no-bid analysis for a government contracting opportunity using Shipley methodology.

## Analysis Requirements
1. Win Probability (0-100) with detailed reasoning.
2. Incumbent Analysis: Who currently holds this work?
3. Competitive Landscape: Who else will bid?
4. Doctrine Alignment: How does this align with GDA's 7 doctrine principles?

## Envision Profile
- Focus: Logistics, sustainment, training, systems engineering, field services, C5ISR
- Primary customers: Army Sustainment Cmd, TACOM/PEO C3T, CASCOM/TRADOC, USCG, USN Special Warfare, FEMA, VA DVS
- Top vehicles: Army RS3, GSA MAS, OASIS SB/+, FAA eFAST, SeaPort-NxG
- Certifications: ISO 9001:2015, CMMI-DEV ML3, CMMC ML2, DCAA-approved, SDB, Minority-Owned

## Source Citation Rule (R1 — binding)
Every factual claim MUST include evidence. Claims without sources are forbidden.

## Output Requirements
Return valid JSON matching OpportunityAnalysisOutput schema exactly.`;

export interface CorrectionContext {
  previousResponse: string;
  validationError: string;
}

export interface HandlerResult {
  output: OpportunityAnalysisOutput;
  raw_content: string;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: OpportunityAnalysisInput,
  model: string,
  correction?: CorrectionContext,
): Promise<HandlerResult> {
  const sourcesText = input.sources
    .map((s) => `- [${s.kind}] ${s.title}: ${s.url}`)
    .join('\n');

  const userPrompt = `Analyze this opportunity for Envision Innovative Solutions:

Notice ID: ${input.opportunity_id}
Title: ${input.title}
Description: ${input.description}
Solicitation: ${input.solicitation_number ?? 'N/A'}
NAICS: ${input.naics_codes.join(', ')}
Set-aside: ${input.set_aside ?? 'Full and Open'}
Place of performance: ${input.place_of_performance ?? 'Not specified'}
Response deadline: ${input.response_deadline ?? 'Not specified'}
Incumbent: ${input.incumbent_info ?? 'No incumbent data available'}

Sources:
${sourcesText || 'No sources provided'}

Provide your complete analysis as JSON.`;

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
    max_tokens: 4096,
    temperature: 0.3,
  });

  const parsed = JSON.parse(response.content) as OpportunityAnalysisOutput;

  return {
    output: parsed,
    raw_content: response.content,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
