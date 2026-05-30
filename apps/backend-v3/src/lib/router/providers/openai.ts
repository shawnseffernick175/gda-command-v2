/**
 * OpenAI provider adapter.
 * Used for embeddings (text-embedding-3-large) and chat fallback if needed.
 */

import OpenAI from 'openai';
import type { LLMChatRequest, LLMChatResponse, LLMEmbedRequest, LLMEmbedResponse, LLMProvider } from './types.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY']! });
  }
  return client;
}

export const openaiProvider: LLMProvider = {
  name: 'openai',

  async chat(req: LLMChatRequest, signal?: AbortSignal): Promise<LLMChatResponse> {
    const sdk = getClient();
    const response = await sdk.chat.completions.create(
      {
        model: req.model,
        max_tokens: req.max_tokens ?? 4096,
        temperature: req.temperature ?? 0,
        messages: [
          ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
          ...req.messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
      },
      { signal },
    );

    return {
      text: response.choices[0]?.message?.content ?? '',
      tokens_in: response.usage?.prompt_tokens ?? 0,
      tokens_out: response.usage?.completion_tokens ?? 0,
      model: response.model,
    };
  },

  async embed(req: LLMEmbedRequest, signal?: AbortSignal): Promise<LLMEmbedResponse> {
    const sdk = getClient();
    const response = await sdk.embeddings.create(
      {
        model: req.model,
        input: req.text,
      },
      { signal },
    );

    return {
      embedding: response.data[0]!.embedding,
      dimensions: response.data[0]!.embedding.length,
      tokens_in: response.usage.prompt_tokens,
      model: response.model,
    };
  },
};
