/**
 * semantic_embed handler — OpenAI text-embedding-3-large.
 * Utility task: generate vector embeddings for semantic search.
 */

import type { SemanticEmbedInput, SemanticEmbedOutput } from '../../llm-router.types.js';
import { semanticEmbedOutputSchema } from '../schemas.js';
import type { HandlerContext, HandlerResult } from './types.js';

export async function handleSemanticEmbed(
  input: SemanticEmbedInput,
  ctx: HandlerContext,
): Promise<HandlerResult<'semantic_embed'>> {
  if (!ctx.provider.embed) {
    throw new Error('Provider does not support embeddings');
  }

  const response = await ctx.provider.embed({
    model: ctx.model,
    text: input.text,
  }, ctx.signal);

  const output: SemanticEmbedOutput = {
    embedding: response.embedding,
    dimensions: response.dimensions,
  };

  const validated = semanticEmbedOutputSchema.parse(output);

  return {
    output: validated,
    tokens_in: response.tokens_in,
    tokens_out: 0,
    model_used: response.model,
  };
}
