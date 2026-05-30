/**
 * Common handler interface. Each task handler implements this.
 */

import type { Task, TaskInputMap, TaskOutputMap } from '../../llm-router.types.js';
import type { LLMProvider } from '../providers/types.js';

export interface HandlerContext {
  provider: LLMProvider;
  model: string;
  signal?: AbortSignal;
}

export interface HandlerResult<T extends Task> {
  output: TaskOutputMap[T];
  tokens_in: number;
  tokens_out: number;
  model_used: string;
}

export type TaskHandler<T extends Task> = (
  input: TaskInputMap[T],
  ctx: HandlerContext,
) => Promise<HandlerResult<T>>;
