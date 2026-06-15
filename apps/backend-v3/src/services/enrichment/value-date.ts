/**
 * Opportunity Value & Due Date Enrichment — SAM → GovWin → GovTribe fallback.
 *
 * When SAM.gov is missing value or response_due_date on an opportunity, this
 * service queries GovWin (OAuth2 API) then GovTribe (MCP) to fill in
 * estimated values and forecasted dates.
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
import { mcpCallTool } from '../../ingest/govtribe/mcp_client.js';
import type { GovTribeDetailRecord } from '../../ingest/govtribe/types.js';

const BATCH_SIZE = 50;
const GOVWIN_BATCH_DELAY_MS = 1_200;
const GOVTRIBE_BATCH_DELAY_MS = 2_000;

type ValueSource = 'sam' | 'govwin_estimate' | 'govtribe_estimate' | 'manual';
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
  enriched_value_govtribe: number;
  enriched_date_govwin: number;
  enriched_date_govtribe: number;
  still_null_value: number;
  still_null_date: number;
  govwin_errors: number;
  govtribe_errors: number;
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
 * Try GovWin first, then GovTribe. Returns enrichment data or null.
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

async function enrichFromGovTribe(
  row: EnrichableRow,
  report: EnrichmentReport,
): Promise<EnrichmentHit | null> {
  try {
    if (!row.solicitation_number && !row.title) return null;

    const searchQuery = row.solicitation_number ?? row.title;
    const cacheId = `enrichment_${row.id}`;

    const result = await mcpCallTool<{ results?: GovTribeDetailRecord[] }>(
      'Search_Federal_Contract_Opportunities',
      {
        query: searchQuery,
        per_page: 5,
        fields_to_return: ['due_date', 'solicitation_number', 'name'],
      },
      cacheId,
    );

    if (!result.data) return null;

    const records = result.data.results ?? [];
    if (records.length === 0) return null;

    // Find best match by solicitation number, or take first result
    let match = row.solicitation_number
      ? records.find((r) => r.solicitation_number === row.solicitation_number)
      : undefined;
    if (!match) match = records[0];
    if (!match) return null;

    const dueDate = match.due_date ?? null;

    // GovTribe opp detail doesn't carry estimated_value directly on the search
    // result. We get due_date from the opp. For value, check forecasts.
    let value: number | null = null;

    if (row.solicitation_number) {
      const forecastResult = await mcpCallTool<{ results?: Array<{ estimated_award_value?: number | { low?: number; high?: number }; estimated_solicitation_release_date?: string }> }>(
        'Search_Federal_Forecasts',
        {
          query: row.solicitation_number,
          per_page: 5,
          fields_to_return: ['estimated_award_value', 'estimated_solicitation_release_date'],
        },
        `enrichment_forecast_${row.id}`,
      );

      if (forecastResult.data?.results?.length) {
        const forecast = forecastResult.data.results[0];
        if (forecast?.estimated_award_value != null) {
          const raw = forecast.estimated_award_value;
          if (typeof raw === 'number') {
            value = raw;
          } else if (typeof raw === 'object') {
            value = raw.high ?? raw.low ?? null;
          }
        }
      }
    }

    if (!value && !dueDate) return null;
    const sourceUrl = match.govtribe_url ?? match.source_url ?? `https://govtribe.com/opportunity/${match.govtribe_id}`;
    return { value, dueDate, sourceUrl, sourceTitle: `GovTribe ${match.govtribe_id}` };
  } catch (err) {
    report.govtribe_errors++;
    logger.warn(
      { oppId: row.id, error: err instanceof Error ? err.message : String(err) },
      'enrichment_govtribe_error',
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

  // --- GovWin first ---
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

  // --- GovTribe fallback ---
  const stillNeedsValue = needsValue && !valueEnriched;
  const stillNeedsDate = needsDate && !dateEnriched;

  if (stillNeedsValue || stillNeedsDate) {
    const govtribeResult = await enrichFromGovTribe(row, report);
    if (govtribeResult) {
      if (stillNeedsValue && govtribeResult.value != null) {
        await pool.query(
          `UPDATE opportunities
           SET value_max = $1, value_source = 'govtribe_estimate', value_confidence = 'estimated'
           WHERE id = $2`,
          [govtribeResult.value, row.id],
        );
        await writeSourceRef(row.id, 'govtribe', govtribeResult.sourceUrl, govtribeResult.sourceTitle, 'opportunity_value_max_sources');
        report.enriched_value_govtribe++;
        valueEnriched = true;
      }
      if (stillNeedsDate && govtribeResult.dueDate != null) {
        await pool.query(
          `UPDATE opportunities
           SET response_due_at = $1, date_source = 'govtribe_forecast', date_confidence = 'forecasted'
           WHERE id = $2`,
          [govtribeResult.dueDate, row.id],
        );
        await writeSourceRef(row.id, 'govtribe', govtribeResult.sourceUrl, govtribeResult.sourceTitle, 'opportunity_response_due_at_sources');
        report.enriched_date_govtribe++;
        dateEnriched = true;
      }
    }
  }

  if (needsValue && !valueEnriched) report.still_null_value++;
  if (needsDate && !dateEnriched) report.still_null_date++;
}

/**
 * Main enrichment job: select all opportunities missing value or due date,
 * query GovWin → GovTribe in batches.
 */
export async function runValueDateEnrichment(): Promise<EnrichmentReport> {
  const startedAt = new Date().toISOString();
  const report: EnrichmentReport = {
    started_at: startedAt,
    ended_at: '',
    total_eligible: 0,
    enriched_value_govwin: 0,
    enriched_value_govtribe: 0,
    enriched_date_govwin: 0,
    enriched_date_govtribe: 0,
    still_null_value: 0,
    still_null_date: 0,
    govwin_errors: 0,
    govtribe_errors: 0,
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
      await delay(Math.max(GOVWIN_BATCH_DELAY_MS, GOVTRIBE_BATCH_DELAY_MS));
    }
  }

  report.ended_at = new Date().toISOString();

  logger.info(
    {
      total_eligible: report.total_eligible,
      enriched_value_govwin: report.enriched_value_govwin,
      enriched_value_govtribe: report.enriched_value_govtribe,
      enriched_date_govwin: report.enriched_date_govwin,
      enriched_date_govtribe: report.enriched_date_govtribe,
      still_null_value: report.still_null_value,
      still_null_date: report.still_null_date,
      govwin_errors: report.govwin_errors,
      govtribe_errors: report.govtribe_errors,
    },
    'value_date_enrichment_complete',
  );

  return report;
}
