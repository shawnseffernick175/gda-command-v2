/**
 * captureDeadlineActionsJob.ts — Daily at 06:00 UTC
 *
 * Doctrine source: capture_deadline
 *
 * Creates action items for active captures whose linked opportunity
 * has a response deadline within 14 days.
 * Deduplicates: only one open/in_progress item per capture.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export async function runCaptureDeadlineActionsJob(): Promise<{ created: number; skipped: number }> {
  const tag = '[capture-deadline-actions]';
  logger.info(`${tag} starting`);

  const res = await pool.query<{
    capture_id: string;
    capture_title: string;
    days_left: number;
    response_due_at: string;
    owner: string;
  }>(`
    SELECT
      c.id::TEXT             AS capture_id,
      COALESCE(o.title, 'Untitled capture') AS capture_title,
      EXTRACT(DAY FROM o.response_due_at - NOW())::INT AS days_left,
      o.response_due_at::TEXT AS response_due_at,
      pi.capture_owner       AS owner
    FROM captures c
    JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
    JOIN opportunities o   ON o.id = pi.opportunity_id
    WHERE pi.stage IN ('solicitation', 'pursue')
      AND o.response_due_at IS NOT NULL
      AND o.response_due_at BETWEEN NOW() AND NOW() + INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM action_items ai
        WHERE ai.capture_id = c.id::BIGINT
          AND ai.doctrine_source = 'capture_deadline'
          AND ai.status IN ('open', 'in_progress')
      )
  `);

  let created = 0;
  let skipped = 0;

  for (const row of res.rows) {
    try {
      const severity =
        row.days_left <= 3 ? 'CRITICAL' :
        row.days_left <= 7 ? 'HIGH' :
        'MEDIUM';
      const title = `Submission due in ${row.days_left} days: ${row.capture_title}`;

      await pool.query(
        `INSERT INTO action_items
           (title, detail, owner, owner_email, status, priority, due_date,
            source, source_type, is_auto, doctrine_source, capture_id,
            linked_record_type, linked_record_id, created_at, updated_at)
         VALUES ($1, $2, $3, $3, 'open', $4, $5,
                 'auto', 'capture', TRUE, 'capture_deadline', $6,
                 'capture', $6, NOW(), NOW())`,
        [
          title,
          `Response deadline: ${new Date(row.response_due_at).toLocaleDateString('en-US')}.`,
          row.owner,
          severity,
          row.response_due_at,
          row.capture_id,
        ],
      );
      created++;
    } catch (err) {
      logger.warn({ err, captureId: row.capture_id }, `${tag} failed to create item`);
      skipped++;
    }
  }

  logger.info({ created, skipped }, `${tag} completed`);
  return { created, skipped };
}
