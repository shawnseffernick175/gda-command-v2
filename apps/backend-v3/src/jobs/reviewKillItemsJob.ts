/**
 * reviewKillItemsJob.ts — Event-driven (triggered on review stage completion)
 *
 * Doctrine source: capture_review_killitem
 *
 * When a capture color-stage review is completed, generates action items
 * from the weaknesses and action_items identified in the AI analysis.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

interface AiAnalysis {
  weaknesses?: string[];
  action_items?: string[];
}

export async function generateReviewKillItems(
  captureId: number,
  stageId: number,
  stage: string,
): Promise<{ created: number }> {
  const tag = '[review-kill-items]';

  const stageRow = await pool.query<{
    ai_analysis: AiAnalysis | null;
    capture_id: number;
  }>(
    'SELECT ai_analysis, capture_id FROM capture_color_stages WHERE id = $1',
    [stageId],
  );

  const analysis = stageRow.rows[0]?.ai_analysis;
  if (!analysis) {
    logger.info({ captureId, stageId, stage }, `${tag} no AI analysis found, skipping`);
    return { created: 0 };
  }

  const ownerRes = await pool.query<{ capture_owner: string }>(
    `SELECT pi.capture_owner
     FROM captures c
     JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
     WHERE c.id = $1`,
    [captureId],
  );
  const owner = ownerRes.rows[0]?.capture_owner ?? 'system';

  const captureCtx = await pool.query<{ title: string | null }>(
    `SELECT o.title
     FROM captures c
     JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
     JOIN opportunities o ON o.id = pi.opportunity_id
     WHERE c.id = $1`,
    [captureId],
  );
  const captureTitle = captureCtx.rows[0]?.title ?? 'Untitled';

  const items: string[] = [];
  if (analysis.weaknesses) {
    items.push(...analysis.weaknesses);
  }
  if (analysis.action_items) {
    items.push(...analysis.action_items);
  }

  let created = 0;
  for (const item of items) {
    if (!item || item.trim().length === 0) continue;

    try {
      const title = `[${stage.toUpperCase()} review] ${item.slice(0, 200)}`;
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await pool.query(
        `INSERT INTO action_items
           (title, detail, owner, owner_email, status, priority, due_date,
            source, source_type, is_auto, doctrine_source,
            capture_id, review_stage_id,
            linked_record_type, linked_record_id, created_at, updated_at)
         VALUES ($1, $2, $3, $3, 'open', 'HIGH', $4,
                 'auto', 'capture', TRUE, 'capture_review_killitem',
                 $5, $6,
                 'capture', $5::TEXT, NOW(), NOW())`,
        [title, `From ${stage} review of "${captureTitle}": ${item}`, owner, dueDate, captureId, stageId],
      );
      created++;
    } catch (err) {
      logger.warn({ err, captureId, stageId, item: item.slice(0, 80) }, `${tag} failed to create kill-item`);
    }
  }

  logger.info({ captureId, stageId, stage, created, totalFindings: items.length }, `${tag} completed`);
  return { created };
}
