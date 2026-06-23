/**
 * GovCon News Refresh Cron — F-611
 *
 * Runs daily at 12:00 UTC (7:00 AM ET) to ingest GovCon news from
 * public sources (OrangeSlices, Federal News Network, GovConWire).
 * Upserts into news_items table; the frontend reads via GET /v3/digest/news.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ingestGovConNews } from '../services/digest/news-ingest.js';

export async function runNewsRefresh(): Promise<void> {
  logger.info('[cron] news-refresh starting');
  try {
    const result = await ingestGovConNews(pool);
    logger.info(
      {
        fetched: result.fetched,
        wheelhouse: result.wheelhouse,
        upserted: result.upserted,
        sources_ok: result.sources_ok,
        sources_failed: result.sources_failed,
      },
      '[cron] news-refresh completed',
    );
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'cron_news_refresh_error',
    );
  }
}
