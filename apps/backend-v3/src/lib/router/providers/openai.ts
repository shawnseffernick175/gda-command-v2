/**
 * OpenAI provider adapter.
 * Used for embeddings (text-embedding-3-large) and chat fallback if needed.
 */

import OpenAI from 'openai';

export interface EmbedParams {
  model: string;
  input: string;
}

export interface EmbedResponse {
  embedding: number[];
  dimensions: number;
  tokens_in: number;
  model: string;
}

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

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI();
  }
  return client;
}

export async function embed(params: EmbedParams): Promise<EmbedResponse> {
  const openai = getClient();
  const response = await openai.embeddings.create({
    model: params.model,
    input: params.input,
  });

  const data = response.data[0];
  if (!data) {
    throw new Error('OpenAI returned empty embedding response');
  }

  return {
    embedding: data.embedding,
    dimensions: data.embedding.length,
    tokens_in: response.usage.prompt_tokens,
    model: response.model,
  };
}

export async function chat(params: ChatParams): Promise<ChatResponse> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: params.model,
    messages: params.messages,
    max_tokens: params.max_tokens,
    temperature: params.temperature,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error('OpenAI returned empty chat response');
  }

  return {
    content: choice.message.content,
    tokens_in: response.usage?.prompt_tokens ?? 0,
    tokens_out: response.usage?.completion_tokens ?? 0,
    model: response.model,
  };
}
