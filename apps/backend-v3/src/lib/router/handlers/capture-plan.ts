/**
 * capture_plan handler — Opus
 * Coach per D3 §5 / §12.5-12.6. Returns CapturePlanOutput = D3 CoachOutput.
 */

import type { CapturePlanInput, CapturePlanOutput } from '../../llm-router.types.js';
import * as anthropic from '../providers/anthropic.js';

const SYSTEM_PROMPT = `You are Coach, a capture strategy advisor for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: generate a comprehensive Shipley-anchored capture plan.

## Shipley Methodology Anchoring
1. Customer Profile — who is the buyer, what do they care about?
2. Requirements Summary — distill key requirements.
3. Solution Strategy — how Envision will solve this.
4. Win Themes — 3-5 compelling themes.
5. Ghost Themes — position against specific competitors.
6. Discriminators — concrete Envision differentiators.
7. Pricing Strategy — approach within doctrine guardrails.
8. Teaming Plan — if teaming is recommended.

## Color Review Preparation
- Pink Hat Gaps: what is missing before Pink Team review?
- Red Team Weaknesses: what will Red Team find?
- Gold Team Readiness: is the proposal submit-ready?
- Black Hat Analysis: how will each competitor approach this?

## Source Citation Rule (R1 — binding)
Every factual claim MUST include a source chip.

## Output Requirements
Return valid JSON matching CapturePlanOutput schema. If generation is interrupted, set is_partial: true.`;

export interface HandlerResult {
  output: CapturePlanOutput;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: CapturePlanInput,
  model: string,
): Promise<HandlerResult> {
  const sourcesText = input.sources
    .map((s) => `- [${s.kind}] ${s.title}: ${s.url}`)
    .join('\n');

  const userPrompt = `Generate a capture plan for this pursuit:

## Opportunity
ID: ${input.opportunity_id}
Title: ${input.title}
Description: ${input.description}
Solicitation: ${input.solicitation_number ?? 'N/A'}

## Analyst Assessment Summary
${input.analysis_summary}

## Incumbent
${input.incumbent_info ?? 'No incumbent identified'}

## Competitive Landscape
${input.competitor_landscape ?? 'No competitive intelligence available'}

## Envision Capabilities
${input.envision_capabilities.join(', ')}

## Teaming Partners
${input.teaming_partners.length > 0 ? input.teaming_partners.join(', ') : 'No teaming partners identified'}

## Sources
${sourcesText || 'No sources provided'}

Generate the complete capture plan with all review stage assessments.`;

  const response = await anthropic.chat({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 8192,
    temperature: 0.4,
  });

  const parsed = JSON.parse(response.content) as CapturePlanOutput;

  return {
    output: parsed,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
