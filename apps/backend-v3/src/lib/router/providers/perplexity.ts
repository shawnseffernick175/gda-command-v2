/**
 * Perplexity provider adapter.
 * Uses raw fetch (no official SDK).
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export interface ChatParams {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  max_tokens: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
}

interface PerplexityApiResponse {
  id: string;
  model: string;
  choices: {
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function chat(params: ChatParams): Promise<ChatResponse> {
  const apiKey = process.env['PERPLEXITY_API_KEY'];
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  const response = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const body = await response.text().catch(() => '');
    if (status === 429) {
      const err = new Error(`Perplexity rate limited (429)`);
      (err as NodeJS.ErrnoException).code = '429';
      throw err;
    }
    if (status >= 500) {
      const err = new Error(`Perplexity server error (${status}): ${body}`);
      (err as NodeJS.ErrnoException).code = String(status);
      throw err;
    }
    throw new Error(`Perplexity API error (${status}): ${body}`);
  }

  const data = (await response.json()) as PerplexityApiResponse;
  const choice = data.choices[0];
  if (!choice?.message?.content) {
    throw new Error('Perplexity returned empty response');
  }

  return {
    content: choice.message.content,
    tokens_in: data.usage.prompt_tokens,
    tokens_out: data.usage.completion_tokens,
    model: data.model,
  };
}
