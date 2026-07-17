/**
 * Launchpad Pre-Warm Cron — F-308
 *
 * Runs every hour to materialize Daily News from ingested sources.
 * Also refreshes door summaries cache.
 */

import { logger } from '../lib/logger.js';
import { runLaunchpadPreWarm } from '../services/launchpad/pre-warm.js';

export async function runLaunchpadPreWarmCron(): Promise<void> {
  logger.info('[cron] launchpad-pre-warm starting');
  try {
    const result = await runLaunchpadPreWarm();
    logger.info(
      {
        sam: result.sam_inserted,
        usaspending: result.usaspending_inserted,
        federal_register: result.federal_register_inserted,
        govwin: result.govwin_inserted,
        news: result.news_inserted,
        total: result.total_inserted,
        door_summaries: result.door_summaries_refreshed,
      },
      '[cron] launchpad-pre-warm completed',
    );
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'cron_launchpad_pre_warm_error',
    );
  }
}
