/**
 * Federal Register ingest job — fetches the last 7 days of
 * procurement-related documents, maps to regulatory_notices rows,
 * and upserts with per-field source citations (R1 compliant).
 *
 * Idempotency: UNIQUE on document_number, ON CONFLICT DO NOTHING.
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import { fetchFederalRegisterDocuments } from './client.js';
import { mapFederalRegisterDocument } from './mapper.js';
import type { RegulatoryNoticeRow, RegulatoryNoticeCitation } from './mapper.js';
import type { IngestResult } from '../framework/registry.js';

const LOOKBACK_DAYS = 7;

const FIELD_TO_TABLE: Record<string, string> = {
  title: 'regulatory_notice_title_sources',
  agency: 'regulatory_notice_agency_sources',
  effective_date: 'regulatory_notice_effective_date_sources',
  comments_close_date: 'regulatory_notice_comments_close_sources',
};

async function upsertRegulatoryNoticeWithSources(
  notice: RegulatoryNoticeRow,
  citations: RegulatoryNoticeCitation[],
): Promise<'inserted' | 'skipped'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceUrl = notice.html_url;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ('federal_register', $1, $2, 'high', '{}')
       RETURNING id`,
      [sourceUrl, `Federal Register ${notice.document_number}`],
    );
    const sourceId = sourceRows[0].id;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO regulatory_notices (
         document_number, title, abstract, document_type,
         agency_names, publication_date, effective_date, comments_close_date,
         cfr_references, topics, html_url, pdf_url,
         regulations_dot_gov_docket_id, significant,
         data_source, source_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (document_number) DO NOTHING
       RETURNING id`,
      [
        notice.document_number,
        notice.title,
        notice.abstract,
        notice.document_type,
        notice.agency_names.length > 0
          ? `{${notice.agency_names.map((a) => `"${a.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
          : '{}',
        notice.publication_date,
        notice.effective_date,
        notice.comments_close_date,
        notice.cfr_references.length > 0
          ? `{${notice.cfr_references.map((r) => `"${r.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
          : '{}',
        notice.topics.length > 0
          ? `{${notice.topics.map((t) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
          : '{}',
        notice.html_url,
        notice.pdf_url,
        notice.regulations_dot_gov_docket_id,
        notice.significant,
        notice.data_source,
        sourceId,
      ],
    );

    if (upsertRows.length === 0) {
      await client.query('ROLLBACK');
      return 'skipped';
    }

    const noticeId = upsertRows[0].id;

    for (const citation of citations) {
      const table = FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (regulatory_notice_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (regulatory_notice_id, source_id) DO NOTHING`,
        [noticeId, sourceId],
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

export async function runFederalRegisterIngest(): Promise<IngestResult> {
  const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  logger.info(
    { source: 'federal_register', fromDate: fromDate.toISOString() },
    'federal_register_ingest_job_start',
  );

  const records = await fetchFederalRegisterDocuments(fromDate);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of records) {
    try {
      const mapped = mapFederalRegisterDocument(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertRegulatoryNoticeWithSources(
        mapped.notice,
        mapped.citations,
      );

      if (outcome === 'inserted') inserted++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'federal_register',
          documentNumber: raw.document_number,
          error: err instanceof Error ? err.message : String(err),
        },
        'federal_register_ingest_row_error',
      );
    }
  }

  logger.info(
    { source: 'federal_register', totalFetched: records.length, inserted, skipped },
    'federal_register_ingest_complete',
  );

  return { inserted, updated, skipped };
}
