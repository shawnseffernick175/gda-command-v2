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

export interface HandlerResult {
  output: SourceResearchOutput;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: SourceResearchInput,
  model: string,
): Promise<HandlerResult> {
  const userPrompt = `Research the following:

Query: ${input.query}
${input.context ? `Context: ${input.context}` : ''}
Max sources: ${input.max_sources}

Return findings as JSON.`;

  const response = await perplexity.chat({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0.2,
  });

  const parsed = JSON.parse(response.content) as SourceResearchOutput;

  return {
    output: parsed,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
