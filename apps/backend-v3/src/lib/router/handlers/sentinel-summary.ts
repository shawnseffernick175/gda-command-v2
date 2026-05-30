/**
 * sentinel_summary handler — Haiku
 * Sentinel per D3 §6 / §12.7-12.8
 */

import type { SentinelSummaryInput, SentinelSummaryOutput } from '../../llm-router.types.js';
import * as anthropic from '../providers/anthropic.js';

const SYSTEM_PROMPT = `You are Sentinel, the platform health and qualification monitor for GDA Command.

Your mission: translate structured system health data into plain-English summaries that an operator can act on immediately.

## Rules
1. Always lead with the overall severity (info/warning/critical).
2. For failures, explain in plain English what happened and what the operator should do.
3. Never show raw error codes, stack traces, or technical jargon.

## Output Requirements
Return valid JSON matching SentinelSummaryOutput schema:
{
  "severity": "info" | "warning" | "critical",
  "root_cause": string,
  "recommended_fix": string,
  "affected_components": string[]
}`;

export interface CorrectionContext {
  previousResponse: string;
  validationError: string;
}

export interface HandlerResult {
  output: SentinelSummaryOutput;
  raw_content: string;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export async function handle(
  input: SentinelSummaryInput,
  model: string,
  correction?: CorrectionContext,
): Promise<HandlerResult> {
  const userPrompt = `Summarize this system health event:

Alert type: ${input.alert_type}
Component: ${input.component}
Details: ${input.details}

Recent log lines:
${input.recent_log_lines.join('\n')}

Provide your health summary as JSON.`;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: userPrompt },
  ];

  if (correction) {
    messages.push(
      { role: 'assistant', content: correction.previousResponse },
      {
        role: 'user',
        content: `Your previous response failed schema validation with the following errors:\n\n${correction.validationError}\n\nPlease return a valid response matching the schema exactly. Do not add fields. Do not omit required fields. Return only the JSON object, no commentary.`,
      },
    );
  }

  const response = await anthropic.chat({
    model,
    system: SYSTEM_PROMPT,
    messages,
    max_tokens: 512,
    temperature: 0.1,
  });

  const parsed = JSON.parse(response.content) as SentinelSummaryOutput;

  return {
    output: parsed,
    raw_content: response.content,
    tokens_in: response.tokens_in,
    tokens_out: response.tokens_out,
    model_used: response.model,
  };
}
