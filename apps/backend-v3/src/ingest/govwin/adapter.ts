/**
 * GovWin adapters — GovWinForecastAdapter and GovWinSolicitationAdapter.
 *
 * GovWin opportunities may be forecasts (pre-RFP intel) or active
 * solicitations depending on their status field. Both adapters share
 * the same fetch/parse path via the GovWin web scraper client.
 */

import type {
  ForecastAdapter,
  SolicitationAdapter,
  FetchOpts,
  RawRecord,
  NormalizedOpportunity,
} from '../adapter/types.js';
import {
  discoverRecentOpportunityIds,
  fetchOpportunityBatch,
  type GovWinOpportunity,
} from '../../services/govwin/client.js';

function toNormalized(
  opp: GovWinOpportunity,
  stage: 'forecast' | 'solicitation',
): NormalizedOpportunity {
  const valueCents = opp.valueMin !== null
    ? Math.round(opp.valueMin * 100)
    : null;

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
  };
}

async function fetchGovWinRecords(_opts: FetchOpts): Promise<RawRecord[]> {
  const ids = await discoverRecentOpportunityIds();
  if (ids.length === 0) return [];
  const opps = await fetchOpportunityBatch(ids);
  return opps as unknown as RawRecord[];
}

const FORECAST_STATUSES = new Set(['pre-rfp', 'forecast', 'planning', 'draft rfp']);

export class GovWinForecastAdapter implements ForecastAdapter {
  readonly source = 'govwin' as const;
  readonly defaultStage = 'forecast' as const;

  async fetchRecent(opts: FetchOpts): Promise<RawRecord[]> {
    return fetchGovWinRecords(opts);
  }

  normalize(raw: RawRecord): NormalizedOpportunity | null {
    const opp = raw as unknown as GovWinOpportunity;
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
    const opp = raw as unknown as GovWinOpportunity;
    if (!opp.govwinId) return null;

    const status = (opp.status ?? '').toLowerCase();
    if (FORECAST_STATUSES.has(status)) return null;

    return toNormalized(opp, 'solicitation');
  }
}
