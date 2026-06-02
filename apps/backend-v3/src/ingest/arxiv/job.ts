/**
 * arXiv ingest job — pulls defense/tech-relevant papers from arXiv,
 * maps to opportunity rows, and upserts with per-field source
 * citations (R1 compliant).
 *
 * Idempotency: upsertExternalOpportunity ON CONFLICT (data_source, external_id).
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { fetchArxivPapers } from './client.js';
import { mapArxivEntry } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runArxivIngest(): Promise<IngestResult> {
  logger.info(
    { source: 'arxiv' },
    'arxiv_ingest_job_start',
  );

  const rawPapers = await fetchArxivPapers();

  logger.info({ source: 'arxiv', totalFetched: rawPapers.length }, 'arxiv_ingest_fetched');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawPapers) {
    try {
      if (!raw.arxivId) {
        skipped++;
        continue;
      }

      const mapped = mapArxivEntry(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'arxiv');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'arxiv',
          arxivId: raw.arxivId,
          error: err instanceof Error ? err.message : String(err),
        },
        'arxiv_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
