/**
 * NECO ingest job — fetches recent RFQ/synopsis from NECO search,
 * parses HTML, maps each record, and upserts with source citations.
 */

import { logger } from '../../lib/logger.js';
import { fetchNECOSearchPage, fetchNECOSearchResults, saveDebugHtml } from './client.js';
import { parseNECOSearchResults, extractFormState } from './parser.js';
import { mapNECORecord } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';

export async function runNECOIngest(): Promise<IngestResult> {
  logger.info({ source: 'neco' }, 'neco_ingest_job_start');

  let html: string;
  try {
    const searchPage = await fetchNECOSearchPage();
    const formState = extractFormState(searchPage);

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(formState)) {
      params.append(k, v);
    }
    params.append('btnSearch', 'Search');

    html = await fetchNECOSearchResults(params.toString());
  } catch (err) {
    logger.error(
      { source: 'neco', error: err instanceof Error ? err.message : String(err) },
      'neco_fetch_failed',
    );
    throw err;
  }

  saveDebugHtml(html, `neco_search_${Date.now()}.html`);

  const { records, degraded, degradedReason } = parseNECOSearchResults(html);

  if (degraded) {
    logger.warn(
      { source: 'neco', reason: degradedReason, htmlLength: html.length },
      'neco_ingest_degraded',
    );
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  logger.info({ source: 'neco', totalParsed: records.length }, 'neco_ingest_parsed');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of records) {
    try {
      if (!raw.rfqNumber) {
        skipped++;
        continue;
      }

      const { opportunity, citations } = mapNECORecord(raw);
      const outcome = await upsertExternalOpportunity(opportunity, citations, 'neco');

      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'neco',
          rfqNumber: raw.rfqNumber,
          error: err instanceof Error ? err.message : String(err),
        },
        'neco_ingest_row_error',
      );
    }
  }

  return { inserted, updated, skipped };
}
