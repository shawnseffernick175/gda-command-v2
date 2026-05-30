/**
 * source_research handler — Perplexity sonar-pro
 * Deep-pull a discovered source URL for full-text indexing.
 */

import type { SourceResearchInput, SourceResearchOutput } from '../../llm-router.types.js';
import * as perplexity from '../providers/perplexity.js';

const SYSTEM_PROMPT = `You are a research agent for Georgetown Defense Analytics (GDA).

Your mission: research the given query and return structured findings with source URLs.

## Output Requirements
Return valid JSON matching SourceResearchOutput schema:
{
  "findings": [{ "title": string, "url": string, "snippet": string, "relevance_score": number }],
  "summary": string,
  "sources_consulted": number
}`;

export interface CorrectionContext {
  previousResponse: string;
  validationError: string;
}

export interface HandlerResult {
  output: SourceResearchOutput;
  raw_content: string;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: SourceResearchInput,
  model: string,
  correction?: CorrectionContext,
): Promise<HandlerResult> {
  const userPrompt = `Research the following:

Query: ${input.query}
${input.context ? `Context: ${input.context}` : ''}
Max sources: ${input.max_sources}

Return findings as JSON.`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
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

  const response = await perplexity.chat({
    model,
    messages,
    max_tokens: 4096,
    temperature: 0.2,
  });

  const parsed = JSON.parse(response.content) as SourceResearchOutput;

  return {
    output: parsed,
    raw_content: response.content,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
