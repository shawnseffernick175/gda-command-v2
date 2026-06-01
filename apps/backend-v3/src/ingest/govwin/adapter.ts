/**
 * GovWin IQ adapters — two lifecycle stages:
 *
 *   GovWinForecastAdapter      — forecast-stage opportunities from GovWin IQ
 *   GovWinSolicitationAdapter  — active solicitations from GovWin IQ
 *
 * Both delegate to the existing GovWin web-scraper client and the
 * ingest job's dedup / enrichment logic.
 */

import type {
  ForecastAdapter,
  SolicitationAdapter,
  FetchOpts,
  NormalizedOpportunity,
} from '../adapter/types.js';
import {
  discoverRecentOpportunityIds,
  fetchOpportunityBatch,
  type GovWinOpportunity,
} from '../../services/govwin/client.js';

function govwinToNormalized(opp: GovWinOpportunity): NormalizedOpportunity {
  const sourceUrl = opp.sourceUri;
  return {
    externalId: opp.govwinId,
    title: opp.title,
    agency: opp.agency,
    subAgency: opp.subAgency,
    department: null,
    solicitationNumber: opp.solicitationNumber,
    status: opp.status ?? 'discovery',
    valueMin: opp.valueMin,
    valueMax: opp.valueMax,
    naics: opp.naics,
    psc: null,
    setAside: opp.setAside,
    placeOfPerformance: null,
    responseDueAt: opp.responseDueAt,
    postedAt: opp.postedAt,
    description: opp.description,
    dataSource: 'govwin',
    tags: ['govwin'],
    sourceUrl,
    citations: [{ field: 'title', sourceUrl }],
  };
}

/**
 * Forecasts + general opportunities from GovWin IQ.
 * Takes over the existing 'govwin' source key.
 */
export class GovWinForecastAdapter
  implements ForecastAdapter<GovWinOpportunity>
{
  readonly source = 'govwin' as const;
  readonly defaultStage = 'forecast' as const;

  async fetchRecent(_opts: FetchOpts): Promise<GovWinOpportunity[]> {
    const ids = await discoverRecentOpportunityIds();
    if (ids.length === 0) return [];
    return fetchOpportunityBatch(ids);
  }

  normalize(raw: GovWinOpportunity): NormalizedOpportunity {
    return govwinToNormalized(raw);
  }
}

/**
 * Active solicitations from GovWin IQ.
 * Registered separately so the scheduler can run it on a different
 * cadence than the forecast adapter.
 */
export class GovWinSolicitationAdapter
  implements SolicitationAdapter<GovWinOpportunity>
{
  readonly source = 'govwin.solicitation' as const;
  readonly defaultStage = 'solicitation' as const;

  async fetchRecent(_opts: FetchOpts): Promise<GovWinOpportunity[]> {
    const ids = await discoverRecentOpportunityIds();
    if (ids.length === 0) return [];
    const all = await fetchOpportunityBatch(ids);
    return all.filter(
      (o) =>
        o.status !== null &&
        /active|solicitation|open/i.test(o.status),
    );
  }

  normalize(raw: GovWinOpportunity): NormalizedOpportunity {
    return govwinToNormalized(raw);
  }
}
