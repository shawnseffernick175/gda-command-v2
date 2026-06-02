/**
 * NSF ingest job — pulls the last 7 days of research awards matching
 * defense/tech keywords, maps to opportunity rows, and upserts with
 * per-field source citations (R1 compliant).
 *
 * Idempotency: upsertExternalOpportunity ON CONFLICT (data_source, external_id).
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { fetchNSFAwards } from './client.js';
import { mapNSFAward } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

const LOOKBACK_DAYS = 7;

export async function runNSFIngest(): Promise<IngestResult> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  logger.info(
    { source: 'nsf', fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
    'nsf_ingest_job_start',
  );

  const rawAwards = await fetchNSFAwards({ since: fromDate, until: toDate });

  logger.info({ source: 'nsf', totalFetched: rawAwards.length }, 'nsf_ingest_fetched');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawAwards) {
    try {
      if (!raw.id) {
        skipped++;
        continue;
      }

      const mapped = mapNSFAward(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'nsf');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'nsf',
          awardId: raw.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'nsf_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
