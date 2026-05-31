/**
 * DIBBS ingest job — fetches recent RFQs from DIBBS listing page,
 * parses HTML, maps each record, and upserts with source citations.
 */

import { logger } from '../../lib/logger.js';
import { fetchDIBBSListingPage, saveDebugHtml } from './client.js';
import { parseDIBBSListingPage } from './parser.js';
import { mapDIBBSRecord } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runDIBBSIngest(): Promise<IngestResult> {
  logger.info({ source: 'dibbs' }, 'dibbs_ingest_job_start');

  let html: string;
  try {
    html = await fetchDIBBSListingPage();
  } catch (err) {
    logger.error(
      { source: 'dibbs', error: err instanceof Error ? err.message : String(err) },
      'dibbs_fetch_failed',
    );
    throw err;
  }

  saveDebugHtml(html, `dibbs_listing_${Date.now()}.html`);

  const { records, degraded, degradedReason } = parseDIBBSListingPage(html);

  if (degraded) {
    logger.warn(
      { source: 'dibbs', reason: degradedReason, htmlLength: html.length },
      'dibbs_ingest_degraded',
    );
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  logger.info({ source: 'dibbs', totalParsed: records.length }, 'dibbs_ingest_parsed');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of records) {
    try {
      if (!raw.solicitationNumber) {
        skipped++;
        continue;
      }

      const { opportunity, citations } = mapDIBBSRecord(raw);
      const outcome = await upsertExternalOpportunity(opportunity, citations, 'dibbs');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'dibbs',
          solicitationNumber: raw.solicitationNumber,
          error: err instanceof Error ? err.message : String(err),
        },
        'dibbs_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
