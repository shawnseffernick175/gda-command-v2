/**
 * Anthropic (Claude) provider adapter.
 * Wraps the Anthropic SDK and exposes a normalized chat interface.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMChatRequest, LLMChatResponse, LLMProvider } from './types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY']! });
  }
  return client;
}

export const anthropicProvider: LLMProvider = {
  name: 'anthropic',

  async chat(req: LLMChatRequest, signal?: AbortSignal): Promise<LLMChatResponse> {
    const sdk = getClient();
    const response = await sdk.messages.create(
      {
        model: req.model,
        max_tokens: req.max_tokens ?? 4096,
        system: req.system ?? '',
        temperature: req.temperature ?? 0,
        messages: req.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      },
      { signal },
    );

    const text =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('') || '';

    return {
      text,
      tokens_in: response.usage.input_tokens,
      tokens_out: response.usage.output_tokens,
      model: response.model,
    };
  },
};
