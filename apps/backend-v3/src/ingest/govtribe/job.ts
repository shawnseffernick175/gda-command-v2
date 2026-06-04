/**
 * GovTribe ingest jobs — opportunities poll (7 saved searches), contacts poll,
 * vehicles poll, and daily credit budget rollup.
 *
 * Uses MCP over Streamable HTTP (https://govtribe.com/mcp).
 * Cadence: Mon + Thu 6am ET (10:00 UTC) — configured in cron/index.ts.
 * All jobs are credit-budget-aware via the MCP client.
 * Per-cycle cap (GOVTRIBE_CYCLE_CREDIT_CAP=150) stops mid-cycle if exceeded.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import {
  resetCycleCredits,
  isCycleCapExceeded,
  getCycleCreditsUsed,
  getCycleCreditCap,
  purgeExpiredCache,
} from './mcp_client.js';
import {
  searchOpportunities,
  searchAwards,
  searchForecasts,
  searchContacts,
  searchVehicles,
  fetchOpportunityDetailBatch,
  fetchAwardDetailBatch,
  fetchForecastDetailBatch,
} from './mcp_tools.js';
import { mapGovTribeDetail, mapGovTribeAward, mapGovTribeForecast } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import { ingestGovTribeDetailToRag, ingestGovTribeAwardToRag, ingestGovTribeForecastToRag } from './rag_sink.js';
import type { IngestResult } from '../framework/registry.js';
import type { GovTribeIdStub, GovTribeDetailRecord, GovTribeAwardDetail, GovTribeForecastDetail } from './types.js';
import { GOVTRIBE_SAVED_SEARCHES } from './saved_searches.js';

/** Max IDs per detail-fetch batch (avoids oversized MCP requests). */
const DETAIL_BATCH_SIZE = 25;

/**
 * govtribe.opps.poll — Runs all 7 saved searches against GovTribe MCP.
 * Two-phase: search returns ID stubs, then detail-fetch fills full records.
 * Cadence: Mon + Thu 6am ET (10:00 UTC). Credit cost: ~115 credits/cycle.
 */
export async function runGovTribeOppsIngest(): Promise<IngestResult> {
  logger.info({ source: 'govtribe', searches: GOVTRIBE_SAVED_SEARCHES.length }, 'govtribe_opps_ingest_start');

  resetCycleCredits();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let totalFetched = 0;
  let degraded = false;
  let degradedReason: string | undefined;

  for (const search of GOVTRIBE_SAVED_SEARCHES) {
    if (isCycleCapExceeded()) {
      degraded = true;
      degradedReason = `Cycle cap ${getCycleCreditCap()} exceeded (used ${getCycleCreditsUsed()}) — remaining searches skipped`;
      logger.warn(
        { source: 'govtribe', search: search.name, cycleUsed: getCycleCreditsUsed(), cycleCap: getCycleCreditCap() },
        'govtribe_opps_cycle_cap_skip',
      );
      break;
    }

    const cacheId = `saved_search_${search.id}`;

    // Phase 1: search returns ID stubs
    let result;
    switch (search.category) {
      case 'opportunities':
        result = await searchOpportunities(
          { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage: search.maxResults },
          cacheId,
        );
        break;
      case 'awards':
        result = await searchAwards(
          { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage: search.maxResults },
          cacheId,
        );
        break;
      case 'forecasts':
        result = await searchForecasts(
          { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage: search.maxResults },
          cacheId,
        );
        break;
    }

    if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted' || result.decision === 'skipped_cycle_cap') {
      degraded = true;
      degradedReason = `${search.name}: ${result.decision} (budget ${result.budget_status.pct}%, cycle ${getCycleCreditsUsed()}/${getCycleCreditCap()})`;
      logger.warn(
        { source: 'govtribe', search: search.name, decision: result.decision },
        'govtribe_opps_budget_skip',
      );
      break;
    }

    // Extract IDs from search response (bare stubs or wrapped results)
    const ids = extractIdsFromSearchResponse(result.data);
    if (ids.length === 0) continue;

    logger.info(
      { source: 'govtribe', search: search.name, idCount: ids.length },
      'govtribe_opps_search_ids',
    );

    // Phase 2: detail-fetch in batches for ALL categories
    switch (search.category) {
      case 'opportunities': {
        const details = await fetchOppDetailBatches(ids, search.id);
        totalFetched += details.length;
        for (const detail of details) {
          try {
            const mapped = mapGovTribeDetail(detail);
            if (!mapped) { skipped++; continue; }
            const outcome = await upsertGovTribeOpp(mapped);
            if (outcome === 'inserted') inserted++;
            else if (outcome === 'updated') updated++;
            else skipped++;
            await ingestGovTribeDetailToRag(detail, search.name).catch((err) => {
              logger.error({ source: 'govtribe', govtribeId: detail.govtribe_id, error: err instanceof Error ? err.message : String(err) }, 'govtribe_rag_sink_error');
            });
          } catch (err) {
            skipped++;
            logger.error({ source: 'govtribe', govtribeId: detail.govtribe_id, error: err instanceof Error ? err.message : String(err) }, 'govtribe_opp_row_error');
          }
        }
        break;
      }
      case 'awards': {
        const details = await fetchAwardDetailBatches(ids, search.id);
        totalFetched += details.length;
        for (const detail of details) {
          try {
            const mapped = mapGovTribeAward(detail);
            if (!mapped) { skipped++; continue; }
            inserted++;
            await ingestGovTribeAwardToRag(detail, mapped, search.name).catch((err) => {
              logger.error({ source: 'govtribe', govtribeId: detail.govtribe_id, error: err instanceof Error ? err.message : String(err) }, 'govtribe_award_rag_error');
            });
          } catch (err) {
            skipped++;
            logger.error({ source: 'govtribe', govtribeId: detail.govtribe_id, error: err instanceof Error ? err.message : String(err) }, 'govtribe_award_row_error');
          }
        }
        break;
      }
      case 'forecasts': {
        const details = await fetchForecastDetailBatches(ids, search.id);
        totalFetched += details.length;
        for (const detail of details) {
          try {
            const mapped = mapGovTribeForecast(detail);
            if (!mapped) { skipped++; continue; }
            inserted++;
            await ingestGovTribeForecastToRag(detail, mapped, search.name).catch((err) => {
              logger.error({ source: 'govtribe', govtribeId: detail.govtribe_id, error: err instanceof Error ? err.message : String(err) }, 'govtribe_forecast_rag_error');
            });
          } catch (err) {
            skipped++;
            logger.error({ source: 'govtribe', govtribeId: detail.govtribe_id, error: err instanceof Error ? err.message : String(err) }, 'govtribe_forecast_row_error');
          }
        }
        break;
      }
    }
  }

  logger.info(
    { source: 'govtribe', totalFetched, inserted, updated, skipped, cycleCredits: getCycleCreditsUsed() },
    'govtribe_opps_ingest_complete',
  );

  return { inserted, updated, skipped, degraded, degradedReason };
}

/**
 * Extract govtribe_id values from a search response.
 * Handles both the MCP shape { results: [{ govtribe_id }] }
 * and fallback shapes like { data: [...] } or bare arrays.
 */
function extractIdsFromSearchResponse(data: unknown): string[] {
  if (!data) return [];

  const obj = data as Record<string, unknown>;

  // MCP shape: { results: [{ govtribe_id: "..." }] }
  if (Array.isArray(obj.results)) {
    return (obj.results as GovTribeIdStub[])
      .map((r) => r.govtribe_id)
      .filter(Boolean);
  }

  // Fallback: { data: [...] } or { rows: [...] }
  const arr = obj.data ?? obj.rows ?? (Array.isArray(data) ? data : []);
  if (Array.isArray(arr)) {
    return (arr as Array<Record<string, unknown>>)
      .map((r) => (r.govtribe_id ?? r._id ?? r.id) as string)
      .filter(Boolean);
  }

  return [];
}

/**
 * Extract the results array from an MCP detail-fetch response.
 * GovTribe may return { results: [...] }, { data: [...] }, { rows: [...] }, or a bare array.
 * Mirrors the countResultRows logic in mcp_client.ts.
 */
function extractResultsArray<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  const obj = data as Record<string, unknown>;
  for (const key of ['results', 'data', 'rows']) {
    if (Array.isArray(obj[key])) return obj[key] as T[];
  }
  return [];
}

async function fetchOppDetailBatches(ids: string[], searchId: string): Promise<GovTribeDetailRecord[]> {
  const details: GovTribeDetailRecord[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH_SIZE) {
    if (isCycleCapExceeded()) {
      logger.warn({ source: 'govtribe', remaining: ids.length - i }, 'govtribe_detail_batch_cycle_cap');
      break;
    }
    const batch = ids.slice(i, i + DETAIL_BATCH_SIZE);
    const cacheId = `detail_${searchId}_batch_${Math.floor(i / DETAIL_BATCH_SIZE)}`;
    try {
      const result = await fetchOpportunityDetailBatch(batch, cacheId);
      const rows = extractResultsArray<GovTribeDetailRecord>(result.data);
      if (rows.length > 0) {
        logger.debug({ source: 'govtribe', batchStart: i, rowCount: rows.length }, 'govtribe_opp_detail_batch_ok');
        details.push(...rows);
      }
    } catch (err) {
      logger.error({ source: 'govtribe', batchStart: i, error: err instanceof Error ? err.message : String(err) }, 'govtribe_detail_batch_error');
    }
  }
  return details;
}

async function fetchAwardDetailBatches(ids: string[], searchId: string): Promise<GovTribeAwardDetail[]> {
  const details: GovTribeAwardDetail[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH_SIZE) {
    if (isCycleCapExceeded()) {
      logger.warn({ source: 'govtribe', remaining: ids.length - i }, 'govtribe_award_detail_cycle_cap');
      break;
    }
    const batch = ids.slice(i, i + DETAIL_BATCH_SIZE);
    const cacheId = `award_detail_${searchId}_batch_${Math.floor(i / DETAIL_BATCH_SIZE)}`;
    try {
      const result = await fetchAwardDetailBatch(batch, cacheId);
      const rows = extractResultsArray<GovTribeAwardDetail>(result.data);
      if (rows.length > 0) {
        logger.debug({ source: 'govtribe', batchStart: i, rowCount: rows.length }, 'govtribe_award_detail_batch_ok');
        details.push(...rows);
      }
    } catch (err) {
      logger.error({ source: 'govtribe', batchStart: i, error: err instanceof Error ? err.message : String(err) }, 'govtribe_award_detail_batch_error');
    }
  }
  return details;
}

async function fetchForecastDetailBatches(ids: string[], searchId: string): Promise<GovTribeForecastDetail[]> {
  const details: GovTribeForecastDetail[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH_SIZE) {
    if (isCycleCapExceeded()) {
      logger.warn({ source: 'govtribe', remaining: ids.length - i }, 'govtribe_forecast_detail_cycle_cap');
      break;
    }
    const batch = ids.slice(i, i + DETAIL_BATCH_SIZE);
    const cacheId = `forecast_detail_${searchId}_batch_${Math.floor(i / DETAIL_BATCH_SIZE)}`;
    try {
      const result = await fetchForecastDetailBatch(batch, cacheId);
      const rows = extractResultsArray<GovTribeForecastDetail>(result.data);
      if (rows.length > 0) {
        logger.debug({ source: 'govtribe', batchStart: i, rowCount: rows.length }, 'govtribe_forecast_detail_batch_ok');
        details.push(...rows);
      }
    } catch (err) {
      logger.error({ source: 'govtribe', batchStart: i, error: err instanceof Error ? err.message : String(err) }, 'govtribe_forecast_detail_batch_error');
    }
  }
  return details;
}

async function upsertGovTribeOpp(
  mapped: ReturnType<typeof mapGovTribeDetail> & object,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const { opportunity, citations, govtribe_id, source_uri } = mapped;

  const outcome = await upsertExternalOpportunity(opportunity, citations, 'govtribe');

  await pool.query(
    `UPDATE opportunities
     SET source_uri = $1, govtribe_id = $2
     WHERE data_source = 'govtribe' AND external_id = $3
       AND (source_uri IS DISTINCT FROM $1 OR govtribe_id IS DISTINCT FROM $2)`,
    [source_uri, govtribe_id, govtribe_id],
  );

  return outcome;
}

/**
 * govtribe.contacts.poll — Per-agency contact search via MCP.
 * Cadence: weekly Mon 09:00 UTC. Credit cost: ~20 credits.
 */
export async function runGovTribeContactsIngest(): Promise<IngestResult> {
  logger.info({ source: 'govtribe' }, 'govtribe_contacts_ingest_start');

  let inserted = 0;
  let skipped = 0;

  const { rows: agencies } = await pool.query(
    `SELECT DISTINCT agency FROM opportunities
     WHERE agency IS NOT NULL AND deleted_at IS NULL
     ORDER BY agency LIMIT 10`,
  );

  for (const row of agencies) {
    const agencyName = row.agency as string;
    const cacheId = `contacts_${agencyName.replace(/\s+/g, '_').toLowerCase()}`;

    const result = await searchContacts(
      { query: agencyName, perPage: 10 },
      cacheId,
    );

    if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted' || result.decision === 'skipped_cycle_cap') {
      logger.warn(
        { source: 'govtribe', agency: agencyName, decision: result.decision },
        'govtribe_contacts_budget_skip',
      );
      skipped++;
      continue;
    }

    if (result.data) {
      inserted++;
    } else {
      skipped++;
    }
  }

  logger.info(
    { source: 'govtribe', inserted, skipped },
    'govtribe_contacts_ingest_complete',
  );

  return { inserted, updated: 0, skipped };
}

/**
 * govtribe.vehicles.poll — Contract vehicle search via MCP.
 * Cadence: monthly. Credit cost: ~5 credits.
 */
export async function runGovTribeVehiclesIngest(): Promise<IngestResult> {
  logger.info({ source: 'govtribe' }, 'govtribe_vehicles_ingest_start');

  const cacheId = 'vehicles_list';
  const result = await searchVehicles(
    { query: '', perPage: 50 },
    cacheId,
  );

  if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted' || result.decision === 'skipped_cycle_cap') {
    logger.warn(
      { source: 'govtribe', decision: result.decision },
      'govtribe_vehicles_budget_skip',
    );
    return { inserted: 0, updated: 0, skipped: 1, degraded: true, degradedReason: result.decision };
  }

  const responseData = result.data as Record<string, unknown> | null;
  const items = (responseData?.data ?? responseData?.rows ?? (Array.isArray(responseData) ? responseData : [])) as unknown[];
  const count = items.length;

  logger.info(
    { source: 'govtribe', vehiclesCached: count },
    'govtribe_vehicles_ingest_complete',
  );

  return { inserted: count, updated: 0, skipped: 0 };
}

/**
 * govtribe.budget.rollup — Roll day's ledger into monthly aggregate.
 * Cadence: nightly 23:55 ET. No credits burned.
 */
export async function runGovTribeBudgetRollup(): Promise<IngestResult> {
  logger.info({ source: 'govtribe' }, 'govtribe_budget_rollup_start');

  const month = new Date().toISOString().slice(0, 7);

  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(cost_credits), 0) AS total_credits
     FROM govtribe_credit_ledger
     WHERE decision = 'called'
       AND created_at >= date_trunc('month', NOW())
       AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'`,
  );

  const totalCredits = parseInt(rows[0]?.total_credits ?? '0', 10);

  await pool.query(
    `INSERT INTO govtribe_credit_monthly (month, credits_used)
     VALUES ($1, $2)
     ON CONFLICT (month) DO UPDATE SET
       credits_used = $2,
       updated_at = NOW()`,
    [month, totalCredits],
  );

  await purgeExpiredCache();

  logger.info(
    { source: 'govtribe', month, credits_used: totalCredits },
    'govtribe_budget_rollup_complete',
  );

  return { inserted: 0, updated: 1, skipped: 0 };
}
