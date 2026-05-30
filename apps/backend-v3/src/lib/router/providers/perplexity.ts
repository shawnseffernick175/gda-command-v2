/**
 * Perplexity provider adapter.
 * Wraps the Perplexity API via fetch (no official SDK).
 */

import type { LLMChatRequest, LLMChatResponse, LLMProvider } from './types.js';

const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';

export const perplexityProvider: LLMProvider = {
  name: 'perplexity',

  async chat(req: LLMChatRequest, signal?: AbortSignal): Promise<LLMChatResponse> {
    const apiKey = process.env['PERPLEXITY_API_KEY'];
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set');

    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        messages,
        max_tokens: req.max_tokens ?? 4096,
        temperature: req.temperature ?? 0,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      const err = new Error(`Perplexity API error ${response.status}: ${errorText}`);
      (err as NodeJS.ErrnoException).code = `HTTP_${response.status}`;
      throw err;
    }

    const data = await response.json() as PerplexityResponse;

    return {
      text: data.choices?.[0]?.message?.content ?? '',
      tokens_in: data.usage?.prompt_tokens ?? 0,
      tokens_out: data.usage?.completion_tokens ?? 0,
      model: data.model ?? req.model,
    };
  },
};

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}
