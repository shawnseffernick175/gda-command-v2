/**
 * FPDS ingest job — pulls the last 48 hours of award modifications,
 * parses ATOM XML, maps to award rows, and upserts with source citations.
 *
 * Idempotency: UNIQUE on (piid, last_mod_date), ON CONFLICT DO NOTHING.
 * Parse errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import { fetchFPDSPages } from './client.js';
import { parseFPDSPage } from './parser.js';
import { mapFPDSAward } from './mapper.js';
import type { AwardRow, AwardSourceCitation } from './mapper.js';
import type { IngestResult } from '../framework/registry.js';

const LOOKBACK_HOURS = 48;

const FIELD_TO_TABLE: Record<string, string> = {
  awardee: 'award_awardee_sources',
  value: 'award_value_sources',
  naics: 'award_naics_sources',
  award_date: 'award_award_date_sources',
  agency: 'award_agency_sources',
};

async function upsertAwardWithSources(
  award: AwardRow,
  citations: AwardSourceCitation[],
): Promise<'inserted' | 'skipped'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceUrl = award.fpds_url ?? `https://www.fpds.gov`;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ('fpds', $1, $2, 'high', '{}')
       RETURNING id`,
      [sourceUrl, `FPDS Award ${award.piid}`],
    );
    const sourceId = sourceRows[0].id;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO awards (
         piid, agency_id, agency_name, contracting_office,
         awardee_name, awardee_uei, awardee_duns,
         value_obligated, value_base_and_all_options,
         naics, psc, set_aside,
         place_of_performance_state, place_of_performance_country,
         award_date, last_mod_date, contract_type,
         parent_award_id, sam_notice_id,
         data_source, source_id, fpds_url
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (piid, last_mod_date) DO NOTHING
       RETURNING id`,
      [
        award.piid,
        award.agency_id,
        award.agency_name,
        award.contracting_office,
        award.awardee_name,
        award.awardee_uei,
        award.awardee_duns,
        award.value_obligated,
        award.value_base_and_all_options,
        award.naics,
        award.psc,
        award.set_aside,
        award.place_of_performance_state,
        award.place_of_performance_country,
        award.award_date,
        award.last_mod_date,
        award.contract_type,
        award.parent_award_id,
        award.sam_notice_id,
        award.data_source,
        sourceId,
        award.fpds_url,
      ],
    );

    if (upsertRows.length === 0) {
      await client.query('ROLLBACK');
      return 'skipped';
    }

    const awardId = upsertRows[0].id;

    for (const citation of citations) {
      const table = FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (award_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (award_id, source_id) DO NOTHING`,
        [awardId, sourceId],
      );
    }

    await client.query('COMMIT');
    return 'inserted';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runFPDSIngest(): Promise<IngestResult> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  logger.info(
    { source: 'fpds.gov', fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
    'fpds_ingest_job_start',
  );

  const xmlPages = await fetchFPDSPages(fromDate, toDate);

  let totalParsed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const xml of xmlPages) {
    let records;
    try {
      records = parseFPDSPage(xml);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'fpds_parse_page_error',
      );
      skipped++;
      continue;
    }

    totalParsed += records.length;

    for (const raw of records) {
      try {
        const { award, citations } = mapFPDSAward(raw);
        const outcome = await upsertAwardWithSources(award, citations);

        if (outcome === 'inserted') inserted++;
        else skipped++;
      } catch (err) {
        skipped++;
        logger.error(
          {
            source: 'fpds.gov',
            piid: raw.piid,
            error: err instanceof Error ? err.message : String(err),
          },
          'fpds_ingest_row_error',
        );
      }
    }
  }

  logger.info(
    { source: 'fpds.gov', totalParsed, inserted, skipped },
    'fpds_ingest_fetched',
  );

  return { inserted, updated, skipped };
}
