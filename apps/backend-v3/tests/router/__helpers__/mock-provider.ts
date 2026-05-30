/**
 * Mock provider factory for handler tests.
 * Provides configurable chat/embed responses and call tracking.
 */

import { vi } from 'vitest';
import type { LLMProvider, LLMChatResponse, LLMEmbedResponse } from '../../../src/lib/router/providers/types.js';
import type { HandlerContext } from '../../../src/lib/router/handlers/types.js';

export interface MockProviderOptions {
  name?: string;
  model?: string;
}

export function createMockProvider(opts: MockProviderOptions = {}) {
  const name = opts.name ?? 'mock-provider';
  const model = opts.model ?? 'mock-model';

  const chatFn = vi.fn<(req: unknown, signal?: AbortSignal) => Promise<LLMChatResponse>>();
  const embedFn = vi.fn<(req: unknown, signal?: AbortSignal) => Promise<LLMEmbedResponse>>();

  const provider: LLMProvider = {
    name,
    chat: chatFn as LLMProvider['chat'],
    embed: embedFn as NonNullable<LLMProvider['embed']>,
  };

  const ctx: HandlerContext = {
    provider,
    model,
  };

  return { provider, ctx, chatFn, embedFn };
}

export function chatResponse(output: unknown, overrides?: Partial<LLMChatResponse>): LLMChatResponse {
  return {
    text: JSON.stringify(output),
    tokens_in: overrides?.tokens_in ?? 100,
    tokens_out: overrides?.tokens_out ?? 200,
    model: overrides?.model ?? 'mock-model',
  };
}

export function embedResponse(embedding: number[], overrides?: Partial<LLMEmbedResponse>): LLMEmbedResponse {
  return {
    embedding,
    dimensions: embedding.length,
    tokens_in: overrides?.tokens_in ?? 50,
    model: overrides?.model ?? 'text-embedding-3-large',
  };
}
