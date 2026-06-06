/**
 * Daily Briefing cron — generates and emails the daily brief
 * to all users who have opted in to auto-delivery.
 *
 * Schedule: 6:00 AM ET (11:00 UTC) every weekday — '0 11 * * 1-5'
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { assembleDailyBriefing } from '../services/briefing/assemble.js';
import { sendBriefingEmail } from '../services/briefing/email.js';

export async function runDailyBriefingCron(): Promise<void> {
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  logger.info({ date: todayET }, '[briefing-cron] starting daily briefing delivery');

  // Find users who opted in
  const { rows: users } = await pool.query<{
    id: number;
    email: string;
    settings: Record<string, unknown>;
  }>(
    `SELECT id, email, settings
     FROM users
     WHERE is_active = true
       AND settings->>'briefing_auto_delivery' = 'true'`,
  );

  if (users.length === 0) {
    logger.info('[briefing-cron] no users opted in — skipping');
    return;
  }

  // Generate today's briefing (reuse cache if already generated)
  let briefingRow = await pool.query(
    `SELECT headline, priority_actions, risk_flags,
            market_intel_summary, cert_expiration_warnings, generated_at
     FROM daily_briefing_cache
     WHERE briefing_date = $1`,
    [todayET],
  );

  if (briefingRow.rows.length === 0) {
    logger.info({ date: todayET }, '[briefing-cron] generating briefing on-demand');
    const { output, model_used, quality_flag, trace_id } = await assembleDailyBriefing(todayET);

    await pool.query(
      `INSERT INTO daily_briefing_cache
         (briefing_date, headline, priority_actions, risk_flags,
          market_intel_summary, cert_expiration_warnings,
          model_used, quality_flag, trace_id, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (briefing_date) DO UPDATE SET
         headline = EXCLUDED.headline,
         priority_actions = EXCLUDED.priority_actions,
         risk_flags = EXCLUDED.risk_flags,
         market_intel_summary = EXCLUDED.market_intel_summary,
         cert_expiration_warnings = EXCLUDED.cert_expiration_warnings,
         model_used = EXCLUDED.model_used,
         quality_flag = EXCLUDED.quality_flag,
         trace_id = EXCLUDED.trace_id,
         generated_at = NOW()`,
      [
        todayET,
        output.headline,
        JSON.stringify(output.priority_actions),
        JSON.stringify(output.risk_flags),
        output.market_intel_summary,
        JSON.stringify(output.cert_expiration_warnings),
        model_used,
        quality_flag,
        trace_id,
      ],
    );

    briefingRow = await pool.query(
      `SELECT headline, priority_actions, risk_flags,
              market_intel_summary, cert_expiration_warnings, generated_at
       FROM daily_briefing_cache
       WHERE briefing_date = $1`,
      [todayET],
    );
  }

  const briefing = briefingRow.rows[0]!;
  const emailData = {
    headline: briefing.headline as string,
    priority_actions: (briefing.priority_actions ?? []) as Array<{ action: string; urgency: string; related_entity?: string }>,
    risk_flags: (briefing.risk_flags ?? []) as string[],
    market_intel_summary: (briefing.market_intel_summary ?? '') as string,
    cert_expiration_warnings: (briefing.cert_expiration_warnings ?? []) as string[],
    generated_at: (briefing.generated_at ?? new Date().toISOString()) as string,
  };

  for (const user of users) {
    const deliveryEmail = (user.settings as Record<string, unknown>)?.briefing_delivery_email as string | undefined;
    const target = deliveryEmail || user.email;
    try {
      await sendBriefingEmail(target, emailData);
      logger.info({ userId: user.id, email: target }, '[briefing-cron] delivered');
    } catch (err) {
      logger.error({
        userId: user.id,
        email: target,
        error: err instanceof Error ? err.message : String(err),
      }, '[briefing-cron] delivery failed');
    }
  }

  logger.info({ userCount: users.length }, '[briefing-cron] completed');
}
