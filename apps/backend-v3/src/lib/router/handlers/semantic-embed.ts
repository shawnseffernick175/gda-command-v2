/**
 * semantic_embed handler — OpenAI text-embedding-3-large
 * Generates vector embeddings for semantic search.
 */

import type { SemanticEmbedInput, SemanticEmbedOutput } from '../../llm-router.types.js';
import * as openai from '../providers/openai.js';

export interface HandlerResult {
  output: SemanticEmbedOutput;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: SemanticEmbedInput,
  model: string,
): Promise<HandlerResult> {
  const response = await openai.embed({
    model,
    input: input.text,
  });

  return {
    output: {
      embedding: response.embedding,
      dimensions: response.dimensions,
    },
    tokens_in: response.tokens_in,
    tokens_out: 0,
    model_used: response.model,
  };
}
