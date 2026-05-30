/**
 * source_research handler — Perplexity sonar-pro.
 * Utility task: deep-pull a discovered source URL for indexing.
 */

import type { SourceResearchInput, SourceResearchOutput } from '../../llm-router.types.js';
import { sourceResearchOutputSchema } from '../schemas.js';
import { parseAndValidate } from './parse-output.js';
import type { HandlerContext, HandlerResult } from './types.js';

const SYSTEM_PROMPT = `You are a government contracting research agent. Your task is to find relevant, authoritative sources for procurement research queries.

## Output Requirements
Return valid JSON matching the SourceResearchOutput schema:
{
  "findings": [{ "title": "string", "url": "string", "snippet": "string", "relevance_score": number (0-100) }],
  "summary": "string",
  "sources_consulted": number
}`;

function buildUserPrompt(input: SourceResearchInput): string {
  return `Research the following query:

Query: ${input.query}
${input.context ? `Context: ${input.context}` : ''}
Max sources: ${input.max_sources}

Find relevant sources and provide findings.`;
}

export async function handleSourceResearch(
  input: SourceResearchInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'source_research'>> {
  const userPrompt = buildUserPrompt(input);

  const response = await ctx.provider.chat({
    model: ctx.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }, ctx.signal);

  const parsed = parseAndValidate<SourceResearchOutput>(
    response.text,
    sourceResearchOutputSchema,
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

    const retryParsed = parseAndValidate<SourceResearchOutput>(
      retryResponse.text,
      sourceResearchOutputSchema,
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
