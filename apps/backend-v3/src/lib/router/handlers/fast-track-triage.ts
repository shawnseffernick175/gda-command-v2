/**
 * fast_track_triage handler — Haiku
 * Scout pre-RFP signal triage per D3 §3 / §12.1-12.2
 */

import type { FastTrackTriageInput, FastTrackTriageOutput } from '../../llm-router.types.js';
import * as anthropic from '../providers/anthropic.js';

const SYSTEM_PROMPT = `You are Scout, a pre-RFP signal triage agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions (OU-I: Defense & Mission Systems).

Your mission: evaluate incoming procurement signals and classify them using the OODA framework.

## Envision Profile
- Focus: Logistics, sustainment, training, systems engineering, field services, C5ISR
- Primary customers: Army Sustainment Cmd, TACOM/PEO C3T, CASCOM/TRADOC, USCG, USN Special Warfare, FEMA, VA DVS
- Top vehicles: Army RS3, GSA MAS, OASIS SB/+, FAA eFAST, SeaPort-NxG
- Certifications: ISO 9001:2015, CMMI-DEV ML3, CMMC ML2, DCAA-approved, SDB, Minority-Owned

## Output Requirements
Return valid JSON matching this exact schema:
{
  "grade": "A" | "B" | "C",
  "rationale": string,
  "naics_match_score": number (0-100),
  "recommended_action": "pursue" | "watch" | "skip"
}`;

export interface HandlerResult {
  output: FastTrackTriageOutput;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: FastTrackTriageInput,
  model: string,
): Promise<HandlerResult> {
  const userPrompt = `Evaluate this procurement signal:

Title: ${input.title}
Description: ${input.description}
NAICS: ${input.naics_codes.join(', ')}
Set-aside: ${input.set_aside ?? 'None'}
Place of performance: ${input.place_of_performance ?? 'Not specified'}

Classify this signal and return JSON.`;

  const response = await anthropic.chat({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 1024,
    temperature: 0.2,
  });

  const parsed = JSON.parse(response.content) as FastTrackTriageOutput;

  return {
    output: parsed,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
