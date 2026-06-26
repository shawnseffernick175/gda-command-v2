/**
 * captureStaleActionsJob.ts — Daily at 06:00 UTC
 *
 * Doctrine source: capture_stale
 *
 * Creates action items for active captures (stage in qualified, pursue,
 * solicitation) that have not been updated in >14 days.
 * Deduplicates: only one open/in_progress item per capture.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export async function runCaptureStaleActionsJob(): Promise<{ created: number; skipped: number }> {
  const tag = '[capture-stale-actions]';
  logger.info(`${tag} starting`);

  const res = await pool.query<{
    capture_id: string;
    capture_title: string;
    days_stale: number;
    owner: string;
  }>(`
    SELECT
      c.id::TEXT            AS capture_id,
      COALESCE(o.title, 'Untitled capture') AS capture_title,
      EXTRACT(DAY FROM NOW() - c.updated_at)::INT AS days_stale,
      pi.capture_owner      AS owner
    FROM captures c
    JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
    JOIN opportunities o   ON o.id = pi.opportunity_id
    WHERE pi.stage IN ('qualified', 'pursue', 'solicitation')
      AND c.updated_at < NOW() - INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM action_items ai
        WHERE ai.capture_id = c.id::BIGINT
          AND ai.doctrine_source = 'capture_stale'
          AND ai.status IN ('open', 'in_progress')
      )
  `);

  let created = 0;
  let skipped = 0;

  for (const row of res.rows) {
    try {
      const severity = row.days_stale >= 30 ? 'HIGH' : 'MEDIUM';
      const title = `Refresh capture: ${row.capture_title} (no activity in ${row.days_stale} days)`;
      const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      await pool.query(
        `INSERT INTO action_items
           (title, detail, owner, owner_email, status, priority, due_date,
            source, source_type, is_auto, doctrine_source, capture_id,
            linked_record_type, linked_record_id, created_at, updated_at)
         VALUES ($1, $2, $3, $3, 'open', $4, $5,
                 'auto', 'capture', TRUE, 'capture_stale', $6,
                 'capture', $6, NOW(), NOW())`,
        [title, `Capture has not been updated in ${row.days_stale} days.`, row.owner, severity, dueDate, row.capture_id],
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
