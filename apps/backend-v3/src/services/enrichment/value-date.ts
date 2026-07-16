/**
 * Opportunity Value & Due Date Enrichment — SAM → GovWin fallback.
 *
 * When SAM.gov is missing value or response_due_date on an opportunity, this
 * service queries GovWin (OAuth2 API) to fill in estimated values and
 * forecasted dates.
 *
 * Matching: solicitation number (primary), title + agency fuzzy (fallback).
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import {
  searchBySolicitationNumber as govwinSearchBySol,
  searchByTitleAgency as govwinSearchByTitle,
  type GovWinApiOpportunity,
} from '../govwin/api_client.js';

const BATCH_SIZE = 50;
const GOVWIN_BATCH_DELAY_MS = 1_200;

type ValueSource = 'sam' | 'govwin_estimate' | 'manual';
type Confidence = 'confirmed' | 'estimated' | 'forecasted';

interface EnrichableRow {
  id: number;
  solicitation_number: string | null;
  title: string;
  agency: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  value_source: ValueSource | null;
  date_source: string | null;
}

export interface EnrichmentReport {
  started_at: string;
  ended_at: string;
  total_eligible: number;
  enriched_value_govwin: number;
  enriched_date_govwin: number;
  still_null_value: number;
  still_null_date: number;
  govwin_errors: number;
}

interface EnrichmentHit {
  value: number | null;
  dueDate: string | null;
  sourceUrl: string;
  sourceTitle: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * R1: insert a sources row and link it to the opportunity via field junction table.
 */
async function writeSourceRef(
  oppId: number,
  kind: string,
  sourceUrl: string,
  sourceTitle: string,
  junctionTable: string,
): Promise<void> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sources (kind, url, title, confidence, meta)
     VALUES ($1, $2, $3, 'medium', '{}')
     RETURNING id`,
    [kind, sourceUrl, sourceTitle],
  );
  const sourceId = rows[0]?.id;
  if (!sourceId) return;
  await pool.query(
    `INSERT INTO ${junctionTable} (opportunity_id, source_id)
     VALUES ($1, $2)
     ON CONFLICT (opportunity_id, source_id) DO NOTHING`,
    [oppId, sourceId],
  );
}

/**
 * Query GovWin for value/date enrichment. Returns enrichment data or null.
 */
async function enrichFromGovWin(
  row: EnrichableRow,
  report: EnrichmentReport,
): Promise<EnrichmentHit | null> {
  try {
    let hit: GovWinApiOpportunity | null = null;

    if (row.solicitation_number) {
      hit = await govwinSearchBySol(row.solicitation_number);
    }
    if (!hit && row.title) {
      hit = await govwinSearchByTitle(row.title, row.agency);
    }

    if (!hit) return null;

    const value = hit.valueMax ?? hit.valueMin ?? null;
    const dueDate = hit.responseDueAt ?? null;

    if (!value && !dueDate) return null;
    return { value, dueDate, sourceUrl: hit.sourceUri, sourceTitle: `GovWin ${hit.govwinId}` };
  } catch (err) {
    report.govwin_errors++;
    logger.warn(
      { oppId: row.id, error: err instanceof Error ? err.message : String(err) },
      'enrichment_govwin_error',
    );
    return null;
  }
}

async function applyEnrichment(
  row: EnrichableRow,
  report: EnrichmentReport,
): Promise<void> {
  const needsValue = row.value_min === null && row.value_max === null;
  const needsDate = row.response_due_at === null;

  if (!needsValue && !needsDate) return;

  let valueEnriched = false;
  let dateEnriched = false;

  const govwinResult = await enrichFromGovWin(row, report);
  if (govwinResult) {
    if (needsValue && govwinResult.value != null) {
      await pool.query(
        `UPDATE opportunities
         SET value_max = $1, value_source = 'govwin_estimate', value_confidence = 'estimated'
         WHERE id = $2`,
        [govwinResult.value, row.id],
      );
      await writeSourceRef(row.id, 'govwin', govwinResult.sourceUrl, govwinResult.sourceTitle, 'opportunity_value_max_sources');
      report.enriched_value_govwin++;
      valueEnriched = true;
    }
    if (needsDate && govwinResult.dueDate != null) {
      await pool.query(
        `UPDATE opportunities
         SET response_due_at = $1, date_source = 'govwin_forecast', date_confidence = 'forecasted'
         WHERE id = $2`,
        [govwinResult.dueDate, row.id],
      );
      await writeSourceRef(row.id, 'govwin', govwinResult.sourceUrl, govwinResult.sourceTitle, 'opportunity_response_due_at_sources');
      report.enriched_date_govwin++;
      dateEnriched = true;
    }
  }

  if (needsValue && !valueEnriched) report.still_null_value++;
  if (needsDate && !dateEnriched) report.still_null_date++;
}

/**
 * Main enrichment job: select all opportunities missing value or due date,
 * query GovWin in batches.
 */
export async function runValueDateEnrichment(): Promise<EnrichmentReport> {
  const startedAt = new Date().toISOString();
  const report: EnrichmentReport = {
    started_at: startedAt,
    ended_at: '',
    total_eligible: 0,
    enriched_value_govwin: 0,
    enriched_date_govwin: 0,
    still_null_value: 0,
    still_null_date: 0,
    govwin_errors: 0,
  };

  const countRes = await pool.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM opportunities
     WHERE deleted_at IS NULL
       AND (
         (value_min IS NULL AND value_max IS NULL)
         OR response_due_at IS NULL
       )`,
  );
  report.total_eligible = countRes.rows[0]?.cnt ?? 0;
  logger.info({ total_eligible: report.total_eligible }, 'value_date_enrichment_start');

  if (report.total_eligible === 0) {
    report.ended_at = new Date().toISOString();
    return report;
  }

  let lastId = 0;

  while (true) {
    const batchRes = await pool.query<EnrichableRow>(
      `SELECT id, solicitation_number, title, agency,
              value_min, value_max, response_due_at,
              value_source, date_source
       FROM opportunities
       WHERE deleted_at IS NULL
         AND (
           (value_min IS NULL AND value_max IS NULL)
           OR response_due_at IS NULL
         )
         AND id > $1
       ORDER BY id ASC
       LIMIT $2`,
      [lastId, BATCH_SIZE],
    );

    if (batchRes.rows.length === 0) break;

    for (const row of batchRes.rows) {
      await applyEnrichment(row, report);
      lastId = row.id;
    }

    // Respect rate limits between batches
    if (batchRes.rows.length === BATCH_SIZE) {
      await delay(GOVWIN_BATCH_DELAY_MS);
    }
  }

  report.ended_at = new Date().toISOString();

  logger.info(
    {
      total_eligible: report.total_eligible,
      enriched_value_govwin: report.enriched_value_govwin,
      enriched_date_govwin: report.enriched_date_govwin,
      still_null_value: report.still_null_value,
      still_null_date: report.still_null_date,
      govwin_errors: report.govwin_errors,
    },
    'value_date_enrichment_complete',
  );

  return report;
}
