/**
 * GovWin adapters — GovWinForecastAdapter and GovWinSolicitationAdapter.
 *
 * F-332: Now uses the OAuth2 Web Services API client instead of scraping.
 * GovWin opportunities may be forecasts (pre-RFP intel) or active
 * solicitations depending on their status field.
 */

import type {
  ForecastAdapter,
  SolicitationAdapter,
  FetchOpts,
  RawRecord,
  NormalizedOpportunity,
} from '../adapter/types.js';
import {
  discoverRecentOpportunitiesApi,
  type GovWinApiOpportunity,
} from '../../services/govwin/api_client.js';

function toNormalized(
  opp: GovWinApiOpportunity,
  stage: 'forecast' | 'solicitation',
): NormalizedOpportunity {
  const valueCents = opp.valueMin !== null
    ? Math.round(opp.valueMin * 100)
    : opp.valueMax !== null
      ? Math.round(opp.valueMax * 100)
      : null;

  const hasIncumbent = opp.incumbent != null && opp.incumbent.trim() !== '';

  return {
    source_native_id: opp.govwinId,
    lifecycle_stage: stage,
    title: opp.title,
    agency: opp.agency,
    office: null,
    naics: opp.naics,
    psc: null,
    set_aside: opp.setAside,
    estimated_value_cents: valueCents,
    posted_at: opp.postedAt,
    response_due_at: opp.responseDueAt,
    award_at: null,
    source_url: opp.sourceUri,
    description: opp.description,
    // Enrichment carried through from the GovWin detail endpoint (#1134).
    incumbent: opp.incumbent,
    incumbent_confidence: hasIncumbent ? 'high' : null,
    incumbent_source: hasIncumbent ? 'govwin' : null,
    competitors: opp.competitors ?? [],
    value_min: opp.valueMin,
    value_max: opp.valueMax,
    source_status: opp.status,
  };
}

async function fetchGovWinRecords(_opts: FetchOpts): Promise<RawRecord[]> {
  const opps = await discoverRecentOpportunitiesApi();
  return opps as unknown as RawRecord[];
}

export const FORECAST_STATUSES = new Set([
  'pre-rfp',
  'pre rfp',
  'forecast',
  'planning',
  'draft rfp',
]);

export const SOLICITATION_STATUSES = new Set([
  'source sought',
  'sources sought',
  'pre-solicitation',
  'pre solicitation',
  'solicitation',
  'post-rfp',
  'post rfp',
]);

export const AWARDED_STATUSES = new Set(['awarded', 'award', 'post-award', 'post award']);

/**
 * Classify a Deltek GovWin V3 `status` into our lifecycle stage.
 *
 *   Pre-RFP / Forecast / Planning / Draft RFP        → 'forecast'
 *   Source Sought / Pre-Solicitation / Solicitation
 *     / Post-RFP                                     → 'solicitation'
 *   Awarded                                          → 'awarded'
 *
 * A real GovWin status is always mapped to a concrete lifecycle stage (never
 * left as the generic 'discovery' pipeline placeholder). Unknown/other active
 * statuses default to 'solicitation'.
 */
export function classifyGovWinStage(
  status: string | null | undefined,
): 'forecast' | 'solicitation' | 'awarded' {
  const s = (status ?? '').toLowerCase().trim();
  if (AWARDED_STATUSES.has(s)) return 'awarded';
  if (FORECAST_STATUSES.has(s)) return 'forecast';
  if (SOLICITATION_STATUSES.has(s)) return 'solicitation';
  return 'solicitation';
}

export class GovWinForecastAdapter implements ForecastAdapter {
  readonly source = 'govwin' as const;
  readonly defaultStage = 'forecast' as const;

  async fetchRecent(opts: FetchOpts): Promise<RawRecord[]> {
    return fetchGovWinRecords(opts);
  }

  normalize(raw: RawRecord): NormalizedOpportunity | null {
    const opp = raw as unknown as GovWinApiOpportunity;
    if (!opp.govwinId) return null;

    const status = (opp.status ?? '').toLowerCase();
    if (!FORECAST_STATUSES.has(status)) return null;

    return toNormalized(opp, 'forecast');
  }
}

export class GovWinSolicitationAdapter implements SolicitationAdapter {
  readonly source = 'govwin' as const;
  readonly defaultStage = 'solicitation' as const;

  async fetchRecent(opts: FetchOpts): Promise<RawRecord[]> {
    return fetchGovWinRecords(opts);
  }

  normalize(raw: RawRecord): NormalizedOpportunity | null {
    const opp = raw as unknown as GovWinApiOpportunity;
    if (!opp.govwinId) return null;

    const status = (opp.status ?? '').toLowerCase();
    if (FORECAST_STATUSES.has(status)) return null;

    return toNormalized(opp, 'solicitation');
  }
}
