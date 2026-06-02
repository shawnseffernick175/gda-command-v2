/**
 * DoD RSS ingest job — pulls the daily contract announcements feed,
 * maps each roll-up item to an opportunity row, and upserts with
 * per-field source citations (R1 compliant).
 *
 * Idempotency: upsertExternalOpportunity ON CONFLICT (data_source, external_id).
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { fetchDoDContractsRSS } from './client.js';
import { mapDoDRSSItem } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runDoDRSSIngest(): Promise<IngestResult> {
  logger.info(
    { source: 'dod_rss' },
    'dod_rss_ingest_job_start',
  );

  const rawItems = await fetchDoDContractsRSS();

  logger.info({ source: 'dod_rss', totalFetched: rawItems.length }, 'dod_rss_ingest_fetched');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawItems) {
    try {
      const mapped = mapDoDRSSItem(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'dod_rss');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'dod_rss',
          title: raw.title,
          error: err instanceof Error ? err.message : String(err),
        },
        'dod_rss_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
