/**
 * Auto-pass deadline job — daily cron.
 *
 * CEO rule: any in-pipeline opportunity where response_due_at < NOW() + 30 days
 * AND it has NOT been actively worked (no capture in flight, no proposal stage)
 * gets moved to no_bid with reason 'auto_pass_too_late_to_capture'.
 *
 * Idempotent: if already no_bid/won/lost/gov_cancelled, skip.
 * Does NOT auto-pass opportunities in active capture or proposal stages
 * (pursue, solicitation, post_submittal) — those are human decisions.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ENVISION_NAICS } from '../constants/envision-naics.js';

export interface AutoPassResult {
  scanned: number;
  passed: number;
  skipped_active_capture: number;
  skipped_already_terminal: number;
}

export async function runAutoPassDeadline(): Promise<AutoPassResult> {
  const startMs = Date.now();
  logger.info('[auto-pass-deadline] starting daily scan');

  const result: AutoPassResult = {
    scanned: 0,
    passed: 0,
    skipped_active_capture: 0,
    skipped_already_terminal: 0,
  };

  // Find in-NAICS opportunities closing in <30 days that are not deleted
  const { rows: candidates } = await pool.query<{
    id: string;
    title: string;
    response_due_at: string;
  }>(
    `SELECT id::text, title, response_due_at::text
     FROM opportunities
     WHERE naics = ANY($1)
       AND response_due_at IS NOT NULL
       AND response_due_at < NOW() + INTERVAL '30 days'
       AND response_due_at > NOW() - INTERVAL '30 days'
       AND deleted_at IS NULL`,
    [ENVISION_NAICS],
  );

  result.scanned = candidates.length;

  for (const opp of candidates) {
    // Check current pipeline stage
    const { rows: pipelineRows } = await pool.query<{ stage: string }>(
      `SELECT stage FROM pipeline_items
       WHERE opportunity_id = $1
       ORDER BY id DESC LIMIT 1`,
      [opp.id],
    );

    const currentStage = pipelineRows[0]?.stage ?? null;

    // Skip if already in a terminal stage
    if (currentStage && ['won', 'lost', 'no_bid', 'gov_cancelled'].includes(currentStage)) {
      result.skipped_already_terminal++;
      continue;
    }

    // Skip if in active capture stages (pursue, solicitation, post_submittal)
    // — these are human decisions
    if (currentStage && ['pursue', 'solicitation', 'post_submittal'].includes(currentStage)) {
      result.skipped_active_capture++;
      continue;
    }

    // Check if there's an active capture linked to this opportunity
    const { rows: captureRows } = await pool.query<{ id: string }>(
      `SELECT c.id FROM captures c
       JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
       WHERE pi.opportunity_id = $1
       LIMIT 1`,
      [opp.id],
    );

    if (captureRows.length > 0) {
      result.skipped_active_capture++;
      continue;
    }

    // Owner rule (binding): NOTHING enters the pipeline unless the user puts
    // it there. This job NEVER creates a pipeline_item. If no card exists, the
    // opportunity is left untouched — deadline assessment is handled by the
    // intake assessment flow (relevance/assessment status), not the pipeline.
    if (pipelineRows.length === 0) {
      result.skipped_already_terminal++;
      continue;
    }

    // Update the EXISTING user-owned pipeline item's stage to no_bid.
    // Preserve capture_owner — never overwrite it with 'system'.
    await pool.query(
      `UPDATE pipeline_items SET stage = 'no_bid', updated_at = NOW()
       WHERE opportunity_id = $1
         AND id = (SELECT id FROM pipeline_items WHERE opportunity_id = $1 ORDER BY id DESC LIMIT 1)`,
      [opp.id],
    );

    result.passed++;
    logger.info(
      { opportunityId: opp.id, title: opp.title, response_due_at: opp.response_due_at },
      '[auto-pass-deadline] existing pipeline item moved to no_bid (too late to capture; owner preserved)',
    );
  }

  const durationMs = Date.now() - startMs;
  logger.info(
    { ...result, durationMs },
    '[auto-pass-deadline] daily scan completed',
  );

  return result;
}
