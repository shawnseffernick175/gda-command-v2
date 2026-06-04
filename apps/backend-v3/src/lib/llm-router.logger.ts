/**
 * LLM Router — Call Logger
 *
 * Writes to the llm_calls table per D4 §10.
 * Every route() call writes exactly one row before returning.
 * If fallback was used, a second row is written for the failed primary.
 */

import type { Pool } from 'pg';
import type { Task, Provider, RouterErrorKind } from './llm-router.types.js';

export interface LlmCallLogEntry {
  trace_id: string;
  task: Task;
  provider: Provider;
  model: string;
  operator_id: string | null;
  object_ref: string | null;
  latency_ms: number;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_estimate_usd: number | null;
  fallback_used: boolean;
  error_kind: RouterErrorKind | null;
}

const INSERT_SQL = `
  INSERT INTO llm_calls (
    trace_id, task, provider, model, operator_id, object_ref,
    latency_ms, tokens_input, tokens_output, cost_estimate_usd,
    fallback_used, error_kind
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
`;

/**
 * Log an LLM call to the database. Fire-and-forget — errors are logged but
 * never propagated to the caller. The router must never fail due to logging.
 */
export async function logLlmCall(pool: Pool | null, entry: LlmCallLogEntry): Promise<void> {
  if (!pool) return;

  try {
    await pool.query(INSERT_SQL, [
      entry.trace_id,
      entry.task,
      entry.provider,
      entry.model,
      entry.operator_id,
      entry.object_ref,
      entry.latency_ms,
      entry.tokens_input,
      entry.tokens_output,
      entry.cost_estimate_usd,
      entry.fallback_used,
      entry.error_kind,
    ]);
  } catch (err) {
    // Log but never propagate — router must not fail due to logging issues
    if (typeof console !== 'undefined') {
      console.error('[llm-router-logger] Failed to log call:', err);
    }
  }
}
