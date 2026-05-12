/**
 * LLM Service — dual-model AI integration for GDA Command v2.
 *
 * Models:
 *   - "fast" → OpenAI GPT-4o  (scoring, briefings, structured output)
 *   - "deep" → Anthropic Claude Sonnet  (RFP analysis, proposals, strategy)
 *
 * Features:
 *   - Lazy-initialized clients for both providers
 *   - Graceful fallback: deep → fast if ANTHROPIC_API_KEY not set
 *   - Typed helper for chat completions with system/user messages
 *   - Streaming support for real-time responses
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Model tiers
// ---------------------------------------------------------------------------

export type ModelTier = "fast" | "deep";

const OPENAI_MODEL = "gpt-4o";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Client singletons
// ---------------------------------------------------------------------------

let _openaiClient: OpenAI | null = null;
let _anthropicClient: Anthropic | null = null;

function getOpenAIClient(): OpenAI | null {
  if (_openaiClient) return _openaiClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _openaiClient = new OpenAI({ apiKey: key });
  return _openaiClient;
}

function getAnthropicClient(): Anthropic | null {
  if (_anthropicClient) return _anthropicClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _anthropicClient = new Anthropic({ apiKey: key });
  return _anthropicClient;
}

export function isLLMAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
}

export function isDeepModelAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAvailableModels(): { fast: boolean; deep: boolean } {
  return {
    fast: !!process.env.OPENAI_API_KEY,
    deep: !!process.env.ANTHROPIC_API_KEY,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tier: ModelTier;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ---------------------------------------------------------------------------
// Anthropic chat completion
// ---------------------------------------------------------------------------

async function anthropicCompletion(
  messages: ChatMessage[],
  opts?: {
    temperature?: number;
    max_tokens?: number;
  },
): Promise<LLMResponse> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY not configured — deep model unavailable");
  }

  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: opts?.max_tokens ?? 4096,
    temperature: opts?.temperature ?? 0.7,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    messages: nonSystemMsgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    content: textBlock?.text ?? "",
    model: response.model,
    tier: "deep",
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI chat completion
// ---------------------------------------------------------------------------

async function openaiCompletion(
  messages: ChatMessage[],
  opts?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" | "text" };
  },
): Promise<LLMResponse> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured — fast model unavailable");
  }

  const response = await client.chat.completions.create({
    model: opts?.model ?? OPENAI_MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    max_tokens: opts?.max_tokens ?? 2048,
    ...(opts?.response_format ? { response_format: opts.response_format } : {}),
  });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? "",
    model: response.model,
    tier: "fast",
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Unified chat completion — pick tier, with fallback
// ---------------------------------------------------------------------------

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: {
    tier?: ModelTier;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" | "text" };
  },
): Promise<LLMResponse> {
  const tier = opts?.tier ?? "fast";

  if (tier === "deep" && getAnthropicClient()) {
    return anthropicCompletion(messages, opts);
  }

  // Fallback: if deep requested but unavailable, use fast
  if (tier === "deep" && !getAnthropicClient() && getOpenAIClient()) {
    const result = await openaiCompletion(messages, opts);
    result.tier = "fast"; // mark that we fell back
    return result;
  }

  return openaiCompletion(messages, opts);
}

// ---------------------------------------------------------------------------
// Streaming chat completion (OpenAI only — Claude streaming added later)
// ---------------------------------------------------------------------------

export async function* chatCompletionStream(
  messages: ChatMessage[],
  opts?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  },
): AsyncGenerator<string> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured — streaming unavailable");
  }

  const stream = await client.chat.completions.create({
    model: opts?.model ?? OPENAI_MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    max_tokens: opts?.max_tokens ?? 2048,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ---------------------------------------------------------------------------
// Domain-specific prompts
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPTS = {
  ragChat: `You are the GDA Command v2 Knowledge Base AI assistant. You help government contracting professionals find information in their document library.

When answering questions:
- Use the provided document context to give accurate, sourced answers
- Cite specific documents by title and page number when available
- If the context doesn't contain enough information, say so clearly
- Use professional government contracting terminology
- Keep responses concise but thorough
- Format with markdown for readability`,

  cparsNarrative: `You are an expert government contracting CPARS (Contractor Performance Assessment Reporting System) narrative writer.

Generate a professional CPARS-ready past performance narrative based on the provided contract data. The narrative should:
- Be written in third person, referring to the contractor by name
- Highlight key accomplishments and quantitative metrics
- Address each rating dimension (quality, schedule, cost, management)
- Use specific numbers, percentages, and concrete examples
- Be suitable for direct inclusion in a CPARS evaluation
- Be 200-300 words long
- Follow FAR 42.1503 evaluation criteria language`,

  rfpShredder: `You are an expert government contracting RFP analyst. Your job is to extract structured requirements from solicitation documents.

For each requirement found:
- Identify the requirement type (SHALL, MUST, WILL, or SHOULD)
- Extract the exact requirement text
- Identify the relevant FAR/DFARS clause if referenced
- Assess complexity (low, medium, high)
- Determine if GDA has matching past performance or capabilities

Return results as a JSON array of requirement objects.`,

  colorReview: `You are an expert government proposal reviewer conducting a color team review.

Based on the review phase:
- **White Team**: Check format compliance — page counts, fonts, volume structure, submission requirements
- **Pink Team**: Check compliance against all solicitation requirements — SHALL/MUST mapping, gap identification
- **Green Team**: Review cost/pricing — BOE accuracy, rate competitiveness, cost realism
- **Red Team**: Score proposal quality — technical approach, management, past performance, executive summary
- **Gold Team**: Make go/no-go recommendation — overall win probability, competitive position, risk assessment

Provide specific, actionable feedback with pass/fail/warning verdicts for each check.`,
} as const;
