/**
 * GovTribe ingest jobs — opportunities poll (7 saved searches), contacts poll,
 * vehicles poll, and daily credit budget rollup.
 *
 * Cadence: Mon + Thu 6am ET (10:00 UTC) — configured in cron/index.ts.
 * All jobs are credit-budget-aware via the govtribeFetch() client.
 * Per-cycle cap (GOVTRIBE_CYCLE_CREDIT_CAP=150) stops mid-cycle if exceeded.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import {
  govtribeFetch,
  purgeExpiredCache,
  resetCycleCredits,
  isCycleCapExceeded,
  getCycleCreditsUsed,
  getCycleCreditCap,
} from './client.js';
import { mapGovTribeOpportunity } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import { ingestGovTribeToRag } from './rag_sink.js';
import type { IngestResult } from '../framework/registry.js';
import type { GovTribeOpportunityRaw, GovTribeListResponse } from './types.js';
import { GOVTRIBE_SAVED_SEARCHES, endpointKeyForCategory } from './saved_searches.js';

const OPPS_PAGE_LIMIT = 50;

/**
 * govtribe.opps.poll — Runs all 7 saved searches against GovTribe MCP.
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

    const endpointKey = endpointKeyForCategory(search.category);
    const queryParam = encodeURIComponent(search.keywords.join(' | '));
    const naicsParam = encodeURIComponent(search.naicsFilter.join(','));
    const path = `/search?tool=${search.mcpTool}&q=${queryParam}&naics=${naicsParam}&limit=${OPPS_PAGE_LIMIT}`;
    const cacheId = `saved_search_${search.id}`;

    const result = await govtribeFetch<GovTribeListResponse<GovTribeOpportunityRaw>>(
      endpointKey,
      path,
      cacheId,
    );

    if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted' || result.decision === 'skipped_cycle_cap') {
      degraded = true;
      degradedReason = `${search.name}: ${result.decision} (budget ${result.budget_status.pct}%, cycle ${getCycleCreditsUsed()}/${getCycleCreditCap()})`;
      logger.warn(
        { source: 'govtribe', search: search.name, decision: result.decision },
        'govtribe_opps_budget_skip',
      );
      break;
    }

    const opps = result.data?.data ?? [];
    if (opps.length === 0) continue;

    totalFetched += opps.length;

    for (const raw of opps) {
      try {
        const mapped = mapGovTribeOpportunity(raw);
        if (!mapped) {
          skipped++;
          continue;
        }

        const outcome = await upsertGovTribeOpp(mapped);
        if (outcome === 'inserted') inserted++;
        else if (outcome === 'updated') updated++;
        else skipped++;

        // RAG sink: write to kb_documents with doc_kind='govtribe', evidence_grade='B'
        await ingestGovTribeToRag(raw, search.name).catch((err) => {
          logger.error(
            { source: 'govtribe', govtribeId: raw._id ?? raw.id, error: err instanceof Error ? err.message : String(err) },
            'govtribe_rag_sink_error',
          );
        });
      } catch (err) {
        skipped++;
        logger.error(
          {
            source: 'govtribe',
            govtribeId: raw._id ?? raw.id,
            error: err instanceof Error ? err.message : String(err),
          },
          'govtribe_opp_row_error',
        );
      }
    }
  }

  logger.info(
    { source: 'govtribe', totalFetched, inserted, updated, skipped, cycleCredits: getCycleCreditsUsed() },
    'govtribe_opps_ingest_complete',
  );

  return { inserted, updated, skipped, degraded, degradedReason };
}

async function upsertGovTribeOpp(
  mapped: ReturnType<typeof mapGovTribeOpportunity> & object,
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
 * govtribe.contacts.poll — Per-agency contact moves for OU3 target list.
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

    const result = await govtribeFetch(
      'agencies_contacts',
      `/agencies?name=${encodeURIComponent(agencyName)}&include=contacts`,
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
 * govtribe.vehicles.poll — Contract vehicle metadata refresh.
 * Cadence: monthly. Credit cost: ~5 credits.
 */
export async function runGovTribeVehiclesIngest(): Promise<IngestResult> {
  logger.info({ source: 'govtribe' }, 'govtribe_vehicles_ingest_start');

  const cacheId = 'vehicles_list';
  const result = await govtribeFetch(
    'vehicles',
    '/vehicles?limit=50',
    cacheId,
  );

  if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted' || result.decision === 'skipped_cycle_cap') {
    logger.warn(
      { source: 'govtribe', decision: result.decision },
      'govtribe_vehicles_budget_skip',
    );
    return { inserted: 0, updated: 0, skipped: 1, degraded: true, degradedReason: result.decision };
  }

  const count = Array.isArray(result.data) ? (result.data as unknown[]).length : 0;

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
