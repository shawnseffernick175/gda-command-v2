/**
 * Anthropic (Claude) provider adapter.
 * Wraps the Anthropic SDK behind the LLMProvider interface.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ChatParams {
  model: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  max_tokens: number;
  system?: string;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function chat(params: ChatParams): Promise<ChatResponse> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    temperature: params.temperature,
    messages: params.messages,
  });

  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  const content = textBlocks.map((b) => b.text).join('');

  return {
    content,
    tokens_in: response.usage.input_tokens,
    tokens_out: response.usage.output_tokens,
    model: response.model,
  };
}
