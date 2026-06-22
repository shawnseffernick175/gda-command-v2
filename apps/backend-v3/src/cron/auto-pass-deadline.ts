/**
 * Auto-pass deadline job — daily cron.
 *
 * CEO rule (binding): any opportunity where response_due_at < NOW() + 30 days
 * is auto-passed. This is a day-one OPPORTUNITIES rule with ZERO pipeline
 * involvement. The cron marks opportunities directly on the opportunities table
 * (relevance_status='auto_pass', assessment_status='pass') so they drop out of
 * the Active list while remaining reversible via the rescue endpoint.
 *
 * Scope:
 *   - Operates on the opportunities table ONLY (no pipeline_items reads/writes).
 *   - Skips rows already terminally disposed (auto_pass, manual_pass, off_profile,
 *     unknown_naics).
 *   - Every disposition change writes an audit_log row.
 *   - Idempotent: re-running on an already-passed row is a no-op.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { recordAuditLog } from '../services/audit/audit-log.js';

export interface AutoPassResult {
  scanned: number;
  passed: number;
  skipped_already_disposed: number;
}

/**
 * Core auto-pass logic. Exported so the backfill endpoint can reuse it.
 *
 * @param dryRun  When true, returns counts without mutating data.
 */
export async function runAutoPassDeadline(
  opts: { dryRun?: boolean } = {},
): Promise<AutoPassResult> {
  const startMs = Date.now();
  logger.info('[auto-pass-deadline] starting daily scan');

  const result: AutoPassResult = {
    scanned: 0,
    passed: 0,
    skipped_already_disposed: 0,
  };

  // Find opportunities closing within 30 days (or already past due within 30
  // days) that are still in a non-terminal relevance state. These are the rows
  // that currently show in Active when they should not.
  const { rows: candidates } = await pool.query<{
    id: string;
    title: string;
    response_due_at: string;
    relevance_status: string | null;
    assessment_status: string;
  }>(
    `SELECT id::text, title, response_due_at::text,
            relevance_status, assessment_status
       FROM opportunities
      WHERE response_due_at IS NOT NULL
        AND response_due_at < NOW() + INTERVAL '30 days'
        AND deleted_at IS NULL
        AND (relevance_status IS NULL OR relevance_status = 'relevant')`,
  );

  result.scanned = candidates.length;

  if (opts.dryRun) {
    result.passed = candidates.length;
    const durationMs = Date.now() - startMs;
    logger.info(
      { ...result, durationMs, dryRun: true },
      '[auto-pass-deadline] dry-run scan completed',
    );
    return result;
  }

  for (const opp of candidates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const oldRelevance = opp.relevance_status;
      const oldAssessment = opp.assessment_status;

      await client.query(
        `UPDATE opportunities
            SET relevance_status  = 'auto_pass',
                relevance_reason  = $2,
                assessment_status = 'pass',
                assessment_reason = $2,
                assessed_at       = NOW(),
                updated_at        = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND (relevance_status IS NULL OR relevance_status = 'relevant')`,
        [
          opp.id,
          `auto_pass: response due ${opp.response_due_at} is within 30-day threshold`,
        ],
      );

      await recordAuditLog(client, {
        action: 'auto_pass_deadline',
        table_name: 'opportunities',
        record_id: Number(opp.id),
        old_values: {
          relevance_status: oldRelevance,
          assessment_status: oldAssessment,
        },
        new_values: {
          relevance_status: 'auto_pass',
          assessment_status: 'pass',
        },
        actor: 'system:auto-pass-deadline',
      });

      await client.query('COMMIT');

      result.passed++;
      logger.info(
        { opportunityId: opp.id, title: opp.title, response_due_at: opp.response_due_at },
        '[auto-pass-deadline] opportunity auto-passed (deadline within 30 days)',
      );
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(
        { opportunityId: opp.id, error: err instanceof Error ? err.message : String(err) },
        '[auto-pass-deadline] failed to auto-pass opportunity',
      );
    } finally {
      client.release();
    }
  }

  const durationMs = Date.now() - startMs;
  logger.info(
    { ...result, durationMs },
    '[auto-pass-deadline] daily scan completed',
  );

  return result;
}
