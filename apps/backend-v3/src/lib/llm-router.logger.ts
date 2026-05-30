/**
 * Router observability — structured log entries per D4 §10.
 * Uses the existing pino logger from the backend.
 */

import { logger } from './logger.js';
import type { Task, Provider, RouterErrorKind } from './llm-router.types.js';

const routerLog = logger.child({ component: 'llm-router' });

export function logInvokeStart(params: {
  trace_id: string;
  task: Task;
  model: string;
  request_id?: string;
}): void {
  routerLog.info(params, 'router.invoke.start');
}

export function logInvokeComplete(params: {
  trace_id: string;
  task: Task;
  model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_estimate_usd: number;
}): void {
  routerLog.info(params, 'router.invoke.complete');
}

export function logInvokeFallback(params: {
  trace_id: string;
  primary_model: string;
  fallback_model: string;
  reason: string;
  primary_latency_ms: number;
}): void {
  routerLog.warn(params, 'router.invoke.fallback');
}

export function logInvokeError(params: {
  trace_id: string;
  task: Task;
  model: string;
  error_code: RouterErrorKind;
  error_message: string;
}): void {
  routerLog.error(params, 'router.invoke.error');
}

export function logInvokeTimeout(params: {
  trace_id: string;
  task: Task;
  model: string;
  budget_ms: number;
  elapsed_ms: number;
}): void {
  routerLog.warn(params, 'router.invoke.timeout');
}
