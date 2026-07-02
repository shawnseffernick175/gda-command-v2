/**
 * News Feedback service — F-308
 *
 * Records dismissed / clicked / saved actions per news card
 * for F-302 relevance training.
 */

import { pool } from '../../lib/db.js';

export type FeedbackAction = 'clicked' | 'dismissed' | 'saved';

export interface NewsFeedbackInput {
  news_id: number;
  action: FeedbackAction;
  user_id: string;
}

export async function recordNewsFeedback(input: NewsFeedbackInput): Promise<void> {
  const { news_id, action, user_id } = input;

  await pool.query(
    `INSERT INTO launchpad_news_feedback (news_id, action, user_id)
     VALUES ($1, $2, $3)`,
    [news_id, action, user_id],
  );

  const columnMap: Record<FeedbackAction, string> = {
    clicked: 'clicked_at',
    dismissed: 'dismissed_at',
    saved: 'saved_at',
  };
  const col = columnMap[action];

  await pool.query(
    `UPDATE launchpad_daily_news SET ${col} = NOW() WHERE id = $1`,
    [news_id],
  );
}
