/**
 * NIH RePORTER ingest job — pulls defense/tech-relevant research awards
 * for the current + previous fiscal year, maps to opportunity rows, and
 * upserts with per-field source citations (R1 compliant).
 *
 * Idempotency: upsertExternalOpportunity ON CONFLICT (data_source, external_id).
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { fetchNIHProjects } from './client.js';
import { mapNIHProject } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runNIHIngest(): Promise<IngestResult> {
  const currentFY = new Date().getFullYear();
  const fiscalYears = [currentFY, currentFY - 1];

  logger.info(
    { source: 'nih', fiscalYears },
    'nih_ingest_job_start',
  );

  const rawProjects = await fetchNIHProjects({ fiscalYears });

  logger.info({ source: 'nih', totalFetched: rawProjects.length }, 'nih_ingest_fetched');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawProjects) {
    try {
      if (raw.appl_id === undefined || raw.appl_id === null) {
        skipped++;
        continue;
      }

      const mapped = mapNIHProject(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'nih');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'nih',
          applId: raw.appl_id,
          error: err instanceof Error ? err.message : String(err),
        },
        'nih_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
