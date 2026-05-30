/**
 * semantic_embed handler — OpenAI text-embedding-3-large
 * Generates vector embeddings for semantic search.
 */

import type { SemanticEmbedInput, SemanticEmbedOutput } from '../../llm-router.types.js';
import * as openai from '../providers/openai.js';

export interface CorrectionContext {
  previousResponse: string;
  validationError: string;
}

export interface HandlerResult {
  output: SemanticEmbedOutput;
  raw_content: string;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: SemanticEmbedInput,
  model: string,
  _correction?: CorrectionContext,
): Promise<HandlerResult> {
  const response = await openai.embed({
    model,
    input: input.text,
  });

  const output = {
    embedding: response.embedding,
    dimensions: response.dimensions,
  };

  return {
    output,
    raw_content: JSON.stringify(output),
    tokens_in: response.tokens_in,
    tokens_out: 0,
    model_used: response.model,
  };
}
