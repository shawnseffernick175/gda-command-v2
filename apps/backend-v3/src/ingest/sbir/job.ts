/**
 * SBIR ingest job — pulls open + pre-release DoD SBIR/STTR topics from
 * the DSIP API (dodsbirsttr.mil), maps to opportunity rows, and upserts
 * with per-field source citations (R1 compliant).
 *
 * Idempotency: upsertExternalOpportunity ON CONFLICT (data_source, external_id).
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { fetchEnrichedTopics } from './client.js';
import { mapDSIPTopic } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runSBIRIngest(): Promise<IngestResult> {
  logger.info({ source: 'sbir' }, 'sbir_ingest_job_start');

  const enrichedTopics = await fetchEnrichedTopics();

  logger.info(
    { source: 'sbir', totalFetched: enrichedTopics.length },
    'sbir_ingest_fetched',
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const topic of enrichedTopics) {
    try {
      if (!topic.list.topicId) {
        skipped++;
        continue;
      }

      const mapped = mapDSIPTopic(topic);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'sbir');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'sbir',
          topicId: topic.list.topicId,
          error: err instanceof Error ? err.message : String(err),
        },
        'sbir_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
