/**
 * Daily Briefing Assembler — F-460b
 *
 * Pulls pipeline state from the DB, calls the LLM router with
 * task='daily_briefing', and returns the structured output.
 */

import pg from 'pg';
import { config } from '../../config/index.js';
import { llmRouter } from '../../lib/llm-router.js';
import { logger } from '../../lib/logger.js';
import type {
  DailyBriefingInput,
  DailyBriefingOutput,
  OpportunitySummary,
  CaptureSummary,
  ActionItemSummary,
  PipelineMilestoneItem,
} from '../../lib/llm-router.types.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 3,
});

export async function assembleDailyBriefing(date: string): Promise<{
  output: DailyBriefingOutput;
  model_used: string | null;
  quality_flag: string;
  trace_id: string;
}> {
  logger.info({ date }, 'Assembling daily briefing');

  const [
    openOpportunities,
    capturesWithGaps,
    actionItemsDue,
    pipelineAtRisk,
  ] = await Promise.all([
    fetchOpenOpportunities(),
    fetchCapturesWithGaps(),
    fetchActionItemsDue(),
    fetchPipelineAtRisk(),
  ]);

  const input: DailyBriefingInput = {
    date,
    open_opportunities: openOpportunities,
    captures_with_gaps: capturesWithGaps,
    action_items_due: actionItemsDue,
    sentinel_status: {
      overall_health: 'healthy',
      active_alerts: [],
      last_check_at: new Date().toISOString(),
    },
    pending_recommendations: [],
    pipeline_at_risk: pipelineAtRisk,
    expiring_certs: [],
  };

  const result = await llmRouter.route({
    task: 'daily_briefing',
    input,
    opts: { disable_router_retry: true, object_ref: `briefing:${date}` },
  });

  if (!result.ok) {
    throw new Error(`LLM briefing generation failed: ${result.error_message}`);
  }

  return {
    output: result.output,
    model_used: result.model_used,
    quality_flag: result.quality_flag,
    trace_id: result.trace_id,
  };
}

async function fetchOpenOpportunities(): Promise<OpportunitySummary[]> {
  const { rows } = await pool.query<{
    id: string;
    title: string;
    solicitation_number: string | null;
    response_due_at: string | null;
    grade: string | null;
    pwin_score: number | null;
    days_until_deadline: number | null;
  }>(`
    SELECT id, title, solicitation_number, response_due_at,
           (analysis->>'grade') as grade,
           (analysis->'pwin'->>'score')::int as pwin_score,
           EXTRACT(DAY FROM (response_due_at - NOW()))::int as days_until_deadline
    FROM opportunities
    WHERE deleted_at IS NULL
      AND status != 'pass'
      AND (
        (analysis->>'grade') = 'A' OR (analysis->>'grade') = 'B'
        OR (analysis->'pwin'->>'band') IN ('forecast', 'signal')
      )
    ORDER BY response_due_at ASC NULLS LAST
    LIMIT 20
  `);

  return rows.map((r) => ({
    opportunity_id: String(r.id),
    title: r.title,
    solicitation_number: r.solicitation_number,
    response_deadline: r.response_due_at,
    grade: (r.grade === 'A' || r.grade === 'B' ? r.grade : 'C') as 'A' | 'B' | 'C',
    pwin: r.pwin_score,
    days_until_deadline: r.days_until_deadline,
  }));
}

async function fetchCapturesWithGaps(): Promise<CaptureSummary[]> {
  const { rows } = await pool.query<{
    id: string;
    color_stage: string;
    win_themes: string[] | null;
    opportunity_title: string;
  }>(`
    SELECT c.id, c.color_stage, c.win_themes,
           o.title as opportunity_title
    FROM captures c
    JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
    JOIN opportunities o ON o.id = pi.opportunity_id
    WHERE o.deleted_at IS NULL
      AND c.color_stage IN ('pink', 'red', 'gold')
    ORDER BY c.updated_at DESC
    LIMIT 10
  `);

  return rows.map((r) => ({
    capture_id: String(r.id),
    opportunity_title: r.opportunity_title,
    color_stage: r.color_stage as CaptureSummary['color_stage'],
    gaps: [],
    next_milestone: null,
  }));
}

async function fetchActionItemsDue(): Promise<ActionItemSummary[]> {
  const { rows } = await pool.query<{
    id: string;
    title: string;
    due_date: string;
    status: string;
  }>(`
    SELECT id, title, due_date, status
    FROM action_items
    WHERE status = 'open'
      AND due_date <= NOW() + INTERVAL '7 days'
    ORDER BY due_date ASC NULLS LAST
    LIMIT 10
  `);

  const now = new Date();
  return rows.map((r) => {
    const due = new Date(r.due_date);
    let urgency: ActionItemSummary['urgency'];
    if (due < now) {
      urgency = 'overdue';
    } else {
      const diffMs = due.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      urgency = diffDays < 1 ? 'today' : 'this_week';
    }
    return {
      id: String(r.id),
      title: r.title,
      due_date: r.due_date,
      urgency,
      related_entity: null,
    };
  });
}

async function fetchPipelineAtRisk(): Promise<PipelineMilestoneItem[]> {
  const { rows } = await pool.query<{
    id: string;
    title: string;
    response_due_at: string;
  }>(`
    SELECT id, title, response_due_at
    FROM opportunities
    WHERE deleted_at IS NULL
      AND (analysis->'pwin'->>'band') IN ('forecast', 'signal')
      AND response_due_at <= NOW() + INTERVAL '14 days'
      AND response_due_at > NOW()
    ORDER BY response_due_at ASC
    LIMIT 5
  `);

  return rows.map((r) => ({
    opportunity_id: String(r.id),
    opportunity_title: r.title,
    milestone: 'Response deadline',
    target_date: r.response_due_at,
    risk_reason: 'Due within 14 days',
  }));
}
