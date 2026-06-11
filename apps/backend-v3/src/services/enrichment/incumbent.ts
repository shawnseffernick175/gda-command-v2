/**
 * Incumbent enrichment pipeline — deterministic two-source lookup
 * (USAspending + FPDS) with confidence scoring.
 *
 * No LLM. No guessing. Auditable match keys.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import { searchFpdsAwards, type FpdsSearchParams } from '../../integrations/fpds/client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type IncumbentConfidence = 'high' | 'medium' | 'low';

export interface IncumbentResult {
  name: string;
  confidence: IncumbentConfidence;
  source: string;
}

export interface OpportunityForIncumbent {
  id: number;
  solicitation_number: string | null;
  naics: string | null;
  agency: string | null;
  place_of_performance_state: string | null;
  value_min: number | null;
  value_max: number | null;
}

// ── USAspending search ───────────────────────────────────────────────────────

const USA_SPENDING_BASE =
  process.env['USASPENDING_API_BASE_URL'] || 'https://api.usaspending.gov';

const USA_SPENDING_TIMEOUT_MS = 60_000;
const USA_SPENDING_MAX_RETRIES = 3;
const USA_SPENDING_INITIAL_BACKOFF_MS = 1_000;

interface USASpendingAwardResult {
  'Award ID': string | null;
  'Recipient Name': string | null;
  'Start Date': string | null;
  'generated_internal_id': string | null;
}

interface USASpendingSearchResponse {
  results: USASpendingAwardResult[];
  page_metadata: {
    page: number;
    hasNext: boolean;
  };
}

async function usaSpendingSearchWithRetry(
  body: Record<string, unknown>,
): Promise<USASpendingSearchResponse> {
  const url = `${USA_SPENDING_BASE}/api/v2/search/spending_by_award/`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= USA_SPENDING_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = USA_SPENDING_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(USA_SPENDING_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(`USAspending ${statusCode}: ${text.slice(0, 300)}`);
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(`USAspending ${statusCode}: ${text.slice(0, 300)}`);
      }

      return (await respBody.json()) as USASpendingSearchResponse;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('USAspending 4') &&
        !err.message.includes('USAspending 429')
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('USAspending: max retries exhausted');
}

type MatchLevel = 'solicitation' | 'naics_agency_pop' | 'naics_agency_value';

interface USASpendingMatch {
  recipientName: string;
  awardId: string;
  internalId: string | null;
  matchLevel: MatchLevel;
}

function buildUSASpendingFilters(
  opp: OpportunityForIncumbent,
  matchLevel: MatchLevel,
): Record<string, unknown> | null {
  const filters: Record<string, unknown> = {
    award_type_codes: ['A', 'B', 'C', 'D'],
  };

  switch (matchLevel) {
    case 'solicitation':
      if (!opp.solicitation_number) return null;
      filters['keyword'] = opp.solicitation_number;
      break;
    case 'naics_agency_pop':
      if (!opp.naics || !opp.agency) return null;
      filters['naics_codes'] = [opp.naics];
      // Agency search uses keyword since API filters are limited
      filters['keyword'] = opp.agency;
      if (opp.place_of_performance_state) {
        filters['place_of_performance_locations'] = [
          { country: 'USA', state: opp.place_of_performance_state },
        ];
      } else {
        return null;
      }
      break;
    case 'naics_agency_value':
      if (!opp.naics || !opp.agency) return null;
      filters['naics_codes'] = [opp.naics];
      filters['keyword'] = opp.agency;
      if (opp.value_min != null && opp.value_max != null) {
        const rangeLow = Math.floor(opp.value_min * 0.8);
        const rangeHigh = Math.ceil(opp.value_max * 1.2);
        filters['award_amounts'] = [
          { lower_bound: rangeLow, upper_bound: rangeHigh },
        ];
      }
      break;
  }

  return filters;
}

async function searchUSASpending(
  opp: OpportunityForIncumbent,
  matchLevel: MatchLevel,
): Promise<USASpendingMatch | null> {
  const filters = buildUSASpendingFilters(opp, matchLevel);
  if (!filters) return null;

  const body = {
    filters,
    fields: ['Award ID', 'Recipient Name', 'Start Date', 'generated_internal_id'],
    page: 1,
    limit: 10,
    sort: 'Start Date',
    order: 'desc',
  };

  try {
    const resp = await usaSpendingSearchWithRetry(body);
    // Pick the most recent award with a non-null recipient
    for (const award of resp.results) {
      const name = award['Recipient Name'];
      if (name && name.trim().length > 0) {
        return {
          recipientName: name.trim(),
          awardId: award['Award ID'] ?? '',
          internalId: award['generated_internal_id'] ?? null,
          matchLevel,
        };
      }
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429') || msg.includes('503')) {
      throw new Error(`rate_limited:usaspending:${msg}`);
    }
    logger.warn(
      { source: 'usaspending', matchLevel, opp_id: opp.id, error: msg },
      'incumbent_usaspending_search_error',
    );
    return null;
  }
}

// ── FPDS fallback ────────────────────────────────────────────────────────────

interface FpdsMatch {
  recipientName: string;
  piid: string;
  matchLevel: MatchLevel;
}

async function searchFpds(
  opp: OpportunityForIncumbent,
  matchLevel: MatchLevel,
): Promise<FpdsMatch | null> {
  const params: FpdsSearchParams = {};

  switch (matchLevel) {
    case 'solicitation':
      if (!opp.solicitation_number) return null;
      params.solicitationId = opp.solicitation_number;
      break;
    case 'naics_agency_pop':
      if (!opp.naics || !opp.agency) return null;
      params.naicsCode = opp.naics;
      params.agency = opp.agency;
      if (opp.place_of_performance_state) {
        params.placeOfPerformanceState = opp.place_of_performance_state;
      } else {
        return null;
      }
      break;
    case 'naics_agency_value':
      if (!opp.naics || !opp.agency) return null;
      params.naicsCode = opp.naics;
      params.agency = opp.agency;
      if (opp.value_min != null && opp.value_max != null) {
        params.valueMin = Math.floor(opp.value_min * 0.8);
        params.valueMax = Math.ceil(opp.value_max * 1.2);
      }
      break;
  }

  try {
    const result = await searchFpdsAwards(params);
    if (result.degraded && result.degradedReason?.startsWith('rate_limited')) {
      throw new Error(`rate_limited:fpds:${result.degradedReason}`);
    }
    // Pick the first entry (already sorted by most recent)
    for (const entry of result.entries) {
      if (entry.recipientName && entry.recipientName.trim().length > 0) {
        return {
          recipientName: entry.recipientName.trim(),
          piid: entry.piid ?? '',
          matchLevel,
        };
      }
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('rate_limited')) {
      throw err;
    }
    logger.warn(
      { source: 'fpds', matchLevel, opp_id: opp.id, error: msg },
      'incumbent_fpds_search_error',
    );
    return null;
  }
}

// ── Confidence mapping ───────────────────────────────────────────────────────

const CONFIDENCE_MAP: Record<MatchLevel, IncumbentConfidence> = {
  solicitation: 'high',
  naics_agency_pop: 'medium',
  naics_agency_value: 'low',
};

// ── Main lookup ──────────────────────────────────────────────────────────────

const MATCH_ORDER: MatchLevel[] = [
  'solicitation',
  'naics_agency_pop',
  'naics_agency_value',
];

/**
 * Look up the incumbent for an opportunity using USAspending (primary)
 * and FPDS (fallback). Returns null when no match is found.
 *
 * Throws on rate limiting so the caller can mark `incumbent_source = 'rate_limited'`
 * and retry on the next cron pass.
 */
export async function lookupIncumbent(
  opp: OpportunityForIncumbent,
): Promise<IncumbentResult | null> {
  // Source 1: USAspending
  for (const level of MATCH_ORDER) {
    const match = await searchUSASpending(opp, level);
    if (match) {
      const awardUrl = match.internalId
        ? `https://www.usaspending.gov/award/${match.internalId}`
        : `https://www.usaspending.gov/search/?keyword=${encodeURIComponent(match.awardId)}`;
      return {
        name: match.recipientName,
        confidence: CONFIDENCE_MAP[match.matchLevel],
        source: `usaspending:${match.awardId}|${awardUrl}`,
      };
    }
  }

  // Source 2: FPDS fallback
  for (const level of MATCH_ORDER) {
    const match = await searchFpds(opp, level);
    if (match) {
      const fpdsUrl = `https://www.fpds.gov/ezsearch/search.do?q=PIID:"${encodeURIComponent(match.piid)}"`;
      return {
        name: match.recipientName,
        confidence: CONFIDENCE_MAP[match.matchLevel],
        source: `fpds:${match.piid}|${fpdsUrl}`,
      };
    }
  }

  return null;
}
