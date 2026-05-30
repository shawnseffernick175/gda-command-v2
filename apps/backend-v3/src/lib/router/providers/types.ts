/**
 * Common LLM provider interface.
 * All providers implement this — business logic never imports a provider directly.
 */

export interface LLMChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  system?: string;
  temperature?: number;
}

export interface LLMChatResponse {
  text: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
}

export interface LLMEmbedRequest {
  model: string;
  text: string;
}

export interface LLMEmbedResponse {
  embedding: number[];
  dimensions: number;
  tokens_in: number;
  model: string;
}

export interface LLMProvider {
  name: string;
  chat(req: LLMChatRequest, signal?: AbortSignal): Promise<LLMChatResponse>;
  embed?(req: LLMEmbedRequest, signal?: AbortSignal): Promise<LLMEmbedResponse>;
}
