/**
 * Router observability — structured log entries per D4 §10.
 * Uses the existing pino logger from logger.ts.
 */

import { logger } from './logger.js';
import type { Task, Provider, RouterErrorKind, TokenUsage } from './llm-router.types.js';

const routerLog = logger.child({ module: 'llm-router' });

export function logInvokeStart(params: {
  trace_id: string;
  task: Task;
  model: string;
  request_id?: string;
}): void {
  routerLog.info(
    {
      event: 'router.invoke.start',
      trace_id: params.trace_id,
      task: params.task,
      model: params.model,
      request_id: params.request_id,
    },
    'router invoke start',
  );
}

export function logInvokeComplete(params: {
  trace_id: string;
  task: Task;
  model: string;
  latency_ms: number;
  tokens: TokenUsage;
  cost_estimate_usd: number;
}): void {
  routerLog.info(
    {
      event: 'router.invoke.complete',
      trace_id: params.trace_id,
      task: params.task,
      model: params.model,
      latency_ms: params.latency_ms,
      tokens_in: params.tokens.input,
      tokens_out: params.tokens.output,
      cost_estimate_usd: params.cost_estimate_usd,
    },
    'router invoke complete',
  );
}

export function logInvokeFallback(params: {
  trace_id: string;
  task: Task;
  primary_model: string;
  fallback_model: string;
  reason: string;
  primary_latency_ms: number;
}): void {
  routerLog.warn(
    {
      event: 'router.invoke.fallback',
      trace_id: params.trace_id,
      task: params.task,
      primary_model: params.primary_model,
      fallback_model: params.fallback_model,
      reason: params.reason,
      primary_latency_ms: params.primary_latency_ms,
    },
    'router invoke fallback',
  );
}

export function logInvokeError(params: {
  trace_id: string;
  task: Task;
  model: string | null;
  error_code: RouterErrorKind;
  error_message: string;
}): void {
  routerLog.error(
    {
      event: 'router.invoke.error',
      trace_id: params.trace_id,
      task: params.task,
      model: params.model,
      error_code: params.error_code,
      error_message: params.error_message,
    },
    'router invoke error',
  );
}

export function logInvokeTimeout(params: {
  trace_id: string;
  task: Task;
  model: string;
  budget_ms: number;
  elapsed_ms: number;
}): void {
  routerLog.warn(
    {
      event: 'router.invoke.timeout',
      trace_id: params.trace_id,
      task: params.task,
      model: params.model,
      budget_ms: params.budget_ms,
      elapsed_ms: params.elapsed_ms,
    },
    'router invoke timeout',
  );
}
