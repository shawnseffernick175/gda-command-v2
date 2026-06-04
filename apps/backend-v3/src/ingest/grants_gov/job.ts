/**
 * Grants.gov ingest job — pulls the last 30 days of posted/forecasted
 * grant opportunities, maps to opportunity rows, and upserts with
 * per-field source citations (R1 compliant).
 *
 * Idempotency: upsertExternalOpportunity ON CONFLICT (data_source, external_id).
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { fetchGrantsGovOpportunities } from './client.js';
import { mapGrantsGovOpp } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runGrantsGovIngest(): Promise<IngestResult> {
  logger.info(
    { source: 'grants.gov' },
    'grants_gov_ingest_job_start',
  );

  const rawOpps = await fetchGrantsGovOpportunities({});

  logger.info({ source: 'grants.gov', totalFetched: rawOpps.length }, 'grants_gov_ingest_fetched');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawOpps) {
    try {
      if (!raw.id) {
        skipped++;
        continue;
      }

      const mapped = mapGrantsGovOpp(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'grants_gov');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'grants.gov',
          oppId: raw.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'grants_gov_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
