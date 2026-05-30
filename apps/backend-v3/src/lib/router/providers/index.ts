/**
 * Provider registry. Maps Provider enum to LLMProvider implementation.
 */

import type { Provider } from '../../llm-router.types.js';
import type { LLMProvider } from './types.js';
import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import { perplexityProvider } from './perplexity.js';

const PROVIDERS: Record<Provider, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  perplexity: perplexityProvider,
};

export function getProvider(name: Provider): LLMProvider {
  return PROVIDERS[name];
}

export type { LLMProvider, LLMChatRequest, LLMChatResponse, LLMEmbedRequest, LLMEmbedResponse } from './types.js';
