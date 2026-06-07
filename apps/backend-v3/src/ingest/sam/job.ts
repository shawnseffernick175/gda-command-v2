/**
 * SAM.gov ingest job — pulls the last 24 hours of opportunities,
 * maps each record, and upserts with source citations.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import { fetchOpportunities } from './client.js';
import { mapSAMOpportunity } from './mapper.js';
import { upsertOpportunityWithSources } from '../framework/source_writer.js';
import { detectAndLinkVehicles } from '../../services/vehicles/detector.js';
import type { IngestResult } from '../framework/registry.js';

const LOOKBACK_HOURS = 24;

export async function runSAMIngest(): Promise<IngestResult> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  logger.info(
    { source: 'sam.gov', fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
    'sam_ingest_job_start',
  );

  const rawOpps = await fetchOpportunities(fromDate, toDate);

  logger.info({ source: 'sam.gov', totalFetched: rawOpps.length }, 'sam_ingest_fetched');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawOpps) {
    try {
      if (!raw.noticeId) {
        skipped++;
        continue;
      }

      const { opportunity, citations } = mapSAMOpportunity(raw);
      const outcome = await upsertOpportunityWithSources(opportunity, citations, 'sam_gov');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;

      // Vehicle detection: look up the opportunity ID and tag matching vehicles
      if (outcome !== 'skipped' && opportunity.sam_notice_id) {
        const idResult = await pool.query<{ id: number }>(
          `SELECT id FROM opportunities WHERE sam_notice_id = $1 LIMIT 1`,
          [opportunity.sam_notice_id],
        );
        if (idResult.rows[0]) {
          await detectAndLinkVehicles(idResult.rows[0].id);
        }
      }
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'sam.gov',
          noticeId: raw.noticeId,
          error: err instanceof Error ? err.message : String(err),
        },
        'sam_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
