/**
 * GovTribe ingest jobs — 7 named saved-search poll, contacts poll,
 * vehicles poll, and daily credit budget rollup.
 *
 * All jobs are credit-budget-aware via the govtribeFetch() client.
 * Per-cycle cap enforced (GOVTRIBE_CYCLE_CREDIT_CAP, default 150).
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import {
  govtribeFetch,
  purgeExpiredCache,
  resetCycleCredits,
  getCycleCreditsUsed,
  getCycleCreditCap,
} from './client.js';
import { mapGovTribeOpportunity } from './mapper.js';
import { upsertExternalOpportunity } from '../framework/source_writer.js';
import type { IngestResult } from '../framework/registry.js';
import type { GovTribeOpportunityRaw, GovTribeListResponse } from './types.js';

const OPPS_PAGE_LIMIT = 50;

/**
 * 7 named saved-search configs from V2 production (docs/govtribe-zapier-setup.md).
 * Each entry maps to a GovTribe MCP tool with specific keywords and NAICS filters.
 */
export interface SavedSearchConfig {
  name: string;
  mcpTool: 'search_opportunities' | 'search_awards' | 'search_forecasts';
  keywords: string;
  naicsFilter: string[];
}

export const GOVTRIBE_SAVED_SEARCHES: SavedSearchConfig[] = [
  {
    name: 'GDA-Opps-Core',
    mcpTool: 'search_opportunities',
    keywords: 'SETA | C5ISR | "PEO IEW&S" | "CPE IEW&S" | "PEO C3N" | "CPE C3N" | cybersecurity | "systems engineering"',
    naicsFilter: ['541511', '541512', '541519', '541330', '541611', '541690'],
  },
  {
    name: 'GDA-Opps-Growth',
    mcpTool: 'search_opportunities',
    keywords: 'CMMC | "AI/ML" | "XR/AR" | DEVCOM | "synthetic training"',
    naicsFilter: ['541511', '541512', '541715', '518210'],
  },
  {
    name: 'GDA-Opps-Opportunistic',
    mcpTool: 'search_opportunities',
    keywords: '"advisory services" | innovation | ISR | EW',
    naicsFilter: ['541611', '541690', '541715'],
  },
  {
    name: 'GDA-Awards-Core',
    mcpTool: 'search_awards',
    keywords: 'SETA | C5ISR | "PEO IEW&S" | "CPE IEW&S" | cybersecurity | "systems engineering"',
    naicsFilter: ['541511', '541512', '541519', '541330'],
  },
  {
    name: 'GDA-Awards-Growth',
    mcpTool: 'search_awards',
    keywords: 'CMMC | "AI/ML" | DEVCOM',
    naicsFilter: ['541511', '541512', '541715'],
  },
  {
    name: 'GDA-Forecasts-Core',
    mcpTool: 'search_forecasts',
    keywords: 'SETA | C5ISR | "PEO IEW&S" | "CPE IEW&S" | cybersecurity',
    naicsFilter: ['541511', '541512', '541519'],
  },
  {
    name: 'GDA-Forecasts-Growth',
    mcpTool: 'search_forecasts',
    keywords: '"AI/ML" | CMMC | DEVCOM | innovation',
    naicsFilter: ['541715', '518210'],
  },
];

function buildSearchPath(search: SavedSearchConfig): string {
  const toolToEndpoint: Record<string, string> = {
    search_opportunities: '/opportunities',
    search_awards: '/awards',
    search_forecasts: '/forecasts',
  };
  const base = toolToEndpoint[search.mcpTool] ?? '/opportunities';
  const params = new URLSearchParams({
    q: search.keywords,
    naics: search.naicsFilter.join(','),
    limit: String(OPPS_PAGE_LIMIT),
  });
  return `${base}?${params.toString()}`;
}

function searchEndpointKey(search: SavedSearchConfig): string {
  return search.mcpTool;
}

/**
 * govtribe.opps.poll — Run 7 named saved searches (Mon + Thu 6am ET).
 * Cadence: 0 10 * * 1,4 (Mon + Thu 6am ET = 10:00 UTC).
 * Expected credit cost: ~115 credits/cycle.
 */
export async function runGovTribeOppsIngest(): Promise<IngestResult> {
  logger.info({ source: 'govtribe' }, 'govtribe_opps_ingest_start');

  resetCycleCredits();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let totalFetched = 0;
  let degraded = false;
  let degradedReason: string | undefined;

  for (const search of GOVTRIBE_SAVED_SEARCHES) {
    const cacheId = `search_${search.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const endpointKey = searchEndpointKey(search);
    const path = buildSearchPath(search);

    const result = await govtribeFetch<GovTribeListResponse<GovTribeOpportunityRaw>>(
      endpointKey,
      path,
      cacheId,
    );

    if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted') {
      degraded = true;
      degradedReason = `Credit budget ${result.budget_status.pct}% (cycle ${getCycleCreditsUsed()}/${getCycleCreditCap()}) — ${result.decision} at search ${search.name}`;
      logger.warn(
        { source: 'govtribe', search: search.name, decision: result.decision, pct: result.budget_status.pct },
        'govtribe_opps_budget_skip',
      );
      break;
    }

    const opps = result.data?.data ?? [];
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
      } catch (err) {
        skipped++;
        logger.error(
          {
            source: 'govtribe',
            search: search.name,
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
 * govtribe.contacts.poll — Per-agency contact moves for target list.
 * Cadence: weekly Mon 05:00 ET. Credit cost: ~20 credits.
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

    if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted') {
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

  if (result.decision === 'skipped_low_budget' || result.decision === 'skipped_halted') {
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
