/**
 * recompeteActionsJob.ts — Weekly Monday 06:00 UTC
 *
 * Doctrine source: recompete_expiring
 *
 * Creates action items for awards with period_of_performance_end
 * within 90 days that are recompete candidates.
 * Deduplicates: only one open/in_progress item per award.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export async function runRecompeteActionsJob(): Promise<{ created: number; skipped: number }> {
  const tag = '[recompete-actions]';
  logger.info(`${tag} starting`);

  const res = await pool.query<{
    award_id: string;
    awardee_name: string;
    piid: string;
    pop_end: string;
    days_left: number;
  }>(`
    SELECT
      a.id::TEXT              AS award_id,
      a.awardee_name,
      a.piid,
      a.period_of_performance_end::TEXT AS pop_end,
      EXTRACT(DAY FROM a.period_of_performance_end - NOW())::INT AS days_left
    FROM awards a
    WHERE a.is_recompete_candidate = TRUE
      AND a.period_of_performance_end IS NOT NULL
      AND a.period_of_performance_end BETWEEN NOW() AND NOW() + INTERVAL '90 days'
      AND NOT EXISTS (
        SELECT 1 FROM action_items ai
        WHERE ai.award_id = a.id
          AND ai.doctrine_source = 'recompete_expiring'
          AND ai.status IN ('open', 'in_progress')
      )
  `);

  let created = 0;
  let skipped = 0;

  for (const row of res.rows) {
    try {
      const severity =
        row.days_left <= 30 ? 'CRITICAL' :
        row.days_left <= 60 ? 'HIGH' :
        'MEDIUM';

      const popEnd = new Date(row.pop_end).toLocaleDateString('en-US');
      const title = `Recompete/extend: ${row.awardee_name ?? row.piid} (PoP ends ${popEnd})`;
      const dueDateMs = new Date(row.pop_end).getTime() - 30 * 24 * 60 * 60 * 1000;
      const dueDate = new Date(Math.max(dueDateMs, Date.now())).toISOString();

      await pool.query(
        `INSERT INTO action_items
           (title, detail, owner, owner_email, status, priority, due_date,
            source, source_type, is_auto, doctrine_source, award_id,
            linked_record_type, linked_record_id, created_at, updated_at)
         VALUES ($1, $2, 'system', 'system', 'open', $3, $4,
                 'auto', 'award', TRUE, 'recompete_expiring', $5,
                 'award', $5, NOW(), NOW())`,
        [
          title,
          `Award ${row.piid} (${row.awardee_name ?? 'unknown'}) — PoP ends ${popEnd}. Evaluate recompete or extension.`,
          severity,
          dueDate,
          row.award_id,
        ],
      );
      created++;
    } catch (err) {
      logger.warn({ err, awardId: row.award_id }, `${tag} failed to create item`);
      skipped++;
    }
  }

  logger.info({ created, skipped }, `${tag} completed`);
  return { created, skipped };
}
