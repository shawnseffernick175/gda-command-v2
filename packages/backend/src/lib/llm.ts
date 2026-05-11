/**
 * LLM Service — centralized OpenAI integration for GDA Command v2.
 *
 * Features:
 *   - Single OpenAI client instance, lazy-initialized
 *   - Graceful fallback when OPENAI_API_KEY is not set
 *   - Typed helper for chat completions with system/user messages
 *   - Streaming support for real-time responses
 */

import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export function isLLMAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
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
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ---------------------------------------------------------------------------
// Chat completion (non-streaming)
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "gpt-4o";

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" | "text" };
  },
): Promise<LLMResponse> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured — LLM calls unavailable");
  }

  const response = await client.chat.completions.create({
    model: opts?.model ?? DEFAULT_MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    max_tokens: opts?.max_tokens ?? 2048,
    ...(opts?.response_format ? { response_format: opts.response_format } : {}),
  });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? "",
    model: response.model,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Streaming chat completion
// ---------------------------------------------------------------------------

export async function* chatCompletionStream(
  messages: ChatMessage[],
  opts?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  },
): AsyncGenerator<string> {
  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured — LLM calls unavailable");
  }

  const stream = await client.chat.completions.create({
    model: opts?.model ?? DEFAULT_MODEL,
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
