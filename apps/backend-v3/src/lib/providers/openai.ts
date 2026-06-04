/**
 * Provider adapter — OpenAI (Embeddings)
 *
 * Handles: semantic_embed task only.
 */

import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw Object.assign(new Error('OPENAI_API_KEY not configured'), { status: 401 });
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface OpenAIEmbedResult {
  embedding: number[];
  dimensions: number;
  tokens_input: number;
  model: string;
}

/**
 * Generate embeddings via OpenAI.
 * Throws on HTTP errors with status code attached.
 */
export async function callOpenAIEmbed(opts: {
  model: string;
  text: string;
  timeout_ms: number;
}): Promise<OpenAIEmbedResult> {
  const openai = getClient();

  try {
    const response = await openai.embeddings.create(
      {
        model: opts.model,
        input: opts.text,
      },
      { timeout: opts.timeout_ms },
    );

    const data = response.data[0];
    if (!data) {
      throw new Error('No embedding returned');
    }

    return {
      embedding: data.embedding,
      dimensions: data.embedding.length,
      tokens_input: response.usage.prompt_tokens,
      model: response.model,
    };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const status = e.status ?? 500;
    throw Object.assign(new Error(e.message ?? 'OpenAI API error'), {
      status,
      code: status >= 500 ? 'PROVIDER_5XX' : undefined,
    });
  }
}

/** Reset client (for testing). */
export function resetOpenAIClient(): void {
  client = null;
}
