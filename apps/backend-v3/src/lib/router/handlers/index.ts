/**
 * Handler registry — maps Task to handler function.
 */

import type { Task, TaskInputMap, TaskOutputMap } from '../../llm-router.types.js';
import type { HandlerContext, HandlerResult } from './types.js';
import { handleFastTrackTriage } from './fast-track-triage.js';
import { handleOpportunityAnalysis } from './opportunity-analysis.js';
import { handleCapturePlan } from './capture-plan.js';
import { handleDailyBriefing } from './daily-briefing.js';
import { handleSentinelSummary } from './sentinel-summary.js';
import { handleDoctrineScore } from './doctrine-score.js';
import { handleSemanticEmbed } from './semantic-embed.js';
import { handleSourceResearch } from './source-research.js';

type AnyHandler = (input: never, ctx: HandlerContext) => Promise<HandlerResult<Task>>;

const HANDLERS: Record<Task, AnyHandler> = {
  fast_track_triage: handleFastTrackTriage as AnyHandler,
  opportunity_analysis: handleOpportunityAnalysis as AnyHandler,
  capture_plan: handleCapturePlan as AnyHandler,
  daily_briefing: handleDailyBriefing as AnyHandler,
  sentinel_summary: handleSentinelSummary as AnyHandler,
  doctrine_score: handleDoctrineScore as AnyHandler,
  semantic_embed: handleSemanticEmbed as AnyHandler,
  source_research: handleSourceResearch as AnyHandler,
};

export function getHandler<T extends Task>(
  task: T,
): (input: TaskInputMap[T], ctx: HandlerContext) => Promise<HandlerResult<T>> {
  const handler = HANDLERS[task];
  if (!handler) throw new Error(`No handler for task: ${task}`);
  return handler as (input: TaskInputMap[T], ctx: HandlerContext) => Promise<HandlerResult<T>>;
}
