/**
 * LLM Gateway — single entry point for all AI calls in GDA Command.
 *
 * Features:
 *   - Classification gate: CUI/ITAR content never reaches public providers
 *   - Organizations Context: every prompt prepended with entity context (W4)
 *   - Call logging: every request/response logged to llm_call_log table
 *   - Cost estimation: tracks tokens and estimates cost per call
 */

import { chatCompletion, type ChatMessage, type ModelTier, type LLMResponse, isLLMAvailable } from "../lib/llm";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Classification types
// ---------------------------------------------------------------------------

type DataClassification = "unclassified" | "fouo" | "cui" | "itar" | "secret";

const PUBLIC_BLOCKED_CLASSIFICATIONS: DataClassification[] = ["cui", "itar", "secret"];

function resolveProvider(tier?: ModelTier): string {
  if (tier === "deep") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
  }
  return process.env.OPENAI_API_KEY ? "openai" : "anthropic";
}

// ---------------------------------------------------------------------------
// Cost estimation (approximate per 1K tokens)
// ---------------------------------------------------------------------------

const COST_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1K[model] ?? { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

// ---------------------------------------------------------------------------
// Organizations context block (W4)
// ---------------------------------------------------------------------------

async function getOrganizationsContext(): Promise<string> {
  const pool = getPool();
  if (!pool) return "";

  try {
    const { rows } = await pool.query(
      `SELECT entity_id, name, legal_name, entity_type, cage_code, uei, naics_codes, set_aside_eligible
       FROM company_entity
       WHERE deleted_at IS NULL
       ORDER BY name`
    );

    if (rows.length === 0) return "";

    const lines = rows.map((r) =>
      `- ${r.name} (${r.entity_type}): CAGE ${r.cage_code ?? "N/A"}, UEI ${r.uei ?? "N/A"}, NAICS [${r.naics_codes?.join(", ") ?? ""}], Set-aside eligible: ${r.set_aside_eligible ? "Yes" : "No"}`
    );

    return `\n\n--- Organizations Context (NewCo Merger) ---\nThe user's organization is a merger of multiple entities. All analysis should consider entity-specific capabilities:\n${lines.join("\n")}\n---\n`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Gateway call
// ---------------------------------------------------------------------------

export interface GatewayCallOptions {
  purpose: string;
  messages: ChatMessage[];
  tier?: ModelTier;
  classification?: DataClassification;
  recordTable?: string;
  recordId?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  includeOrgContext?: boolean;
}

export interface GatewayResult {
  success: boolean;
  content: string;
  model: string;
  tier: ModelTier;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  call_id: string | null;
  blocked: boolean;
  error?: string;
}

export async function gatewayCall(opts: GatewayCallOptions): Promise<GatewayResult> {
  const classification = opts.classification ?? "unclassified";
  const startTime = Date.now();
  const promptHash = crypto.createHash("sha256")
    .update(opts.messages.map((m) => m.content).join(""))
    .digest("hex")
    .slice(0, 16);

  // Classification gate: block CUI/ITAR from public providers
  const provider = process.env.LLM_PROVIDER ?? "public";
  if (PUBLIC_BLOCKED_CLASSIFICATIONS.includes(classification as DataClassification) && provider !== "restricted") {
    const callId = await logCall({
      purpose: opts.purpose,
      provider,
      model: "blocked",
      classification,
      promptHash,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      costEstimate: 0,
      status: "blocked_classification",
      errorText: `Classification '${classification}' blocked from public provider`,
      recordTable: opts.recordTable,
      recordId: opts.recordId,
    });

    return {
      success: false,
      content: "",
      model: "blocked",
      tier: opts.tier ?? "fast",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      call_id: callId,
      blocked: true,
      error: `Content classified as '${classification}' cannot be sent to public LLM providers. Use the restricted/on-prem provider.`,
    };
  }

  // Prepend organizations context if requested
  let messages = [...opts.messages];
  if (opts.includeOrgContext !== false) {
    const orgContext = await getOrganizationsContext();
    if (orgContext && messages.length > 0 && messages[0].role === "system") {
      messages[0] = { ...messages[0], content: messages[0].content + orgContext };
    }
  }

  try {
    const response: LLMResponse = await chatCompletion(messages, {
      tier: opts.tier,
      temperature: opts.temperature,
      max_tokens: opts.max_tokens,
      response_format: opts.response_format,
    });

    const latencyMs = Date.now() - startTime;
    const costEstimate = estimateCost(response.model, response.usage.prompt_tokens, response.usage.completion_tokens);

    const callId = await logCall({
      purpose: opts.purpose,
      provider: response.tier === "deep" ? "anthropic" : "openai",
      model: response.model,
      classification,
      promptHash,
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      latencyMs,
      costEstimate,
      status: "ok",
      errorText: null,
      recordTable: opts.recordTable,
      recordId: opts.recordId,
    });

    return {
      success: true,
      content: response.content,
      model: response.model,
      tier: response.tier,
      usage: response.usage,
      call_id: callId,
      blocked: false,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorText = (err as Error).message;

    const callId = await logCall({
      purpose: opts.purpose,
      provider: resolveProvider(opts.tier),
      model: "error",
      classification,
      promptHash,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      costEstimate: 0,
      status: "error",
      errorText,
      recordTable: opts.recordTable,
      recordId: opts.recordId,
    });

    return {
      success: false,
      content: "",
      model: "error",
      tier: opts.tier ?? "fast",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      call_id: callId,
      blocked: false,
      error: errorText,
    };
  }
}

// ---------------------------------------------------------------------------
// Call logging
// ---------------------------------------------------------------------------

interface LogCallParams {
  purpose: string;
  provider: string;
  model: string;
  classification: string;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costEstimate: number;
  status: string;
  errorText: string | null;
  recordTable?: string;
  recordId?: string;
}

async function logCall(params: LogCallParams): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO llm_call_log
        (purpose, provider, model, classification, prompt_hash,
         input_tokens, output_tokens, latency_ms, cost_usd_est,
         status, error_text, record_table, record_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING call_id`,
      [
        params.purpose, params.provider, params.model, params.classification,
        params.promptHash, params.inputTokens, params.outputTokens,
        params.latencyMs, params.costEstimate, params.status,
        params.errorText, params.recordTable ?? null, params.recordId ?? null,
      ]
    );
    return rows[0]?.call_id ?? null;
  } catch (err) {
    log.error("llm_call_log_error", { error: (err as Error).message });
    return null;
  }
}

export { isLLMAvailable };
