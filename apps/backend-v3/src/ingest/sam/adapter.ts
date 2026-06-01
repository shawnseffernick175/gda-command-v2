/**
 * SamSolicitationAdapter — wraps the existing SAM.gov client + mapper
 * into the SourceAdapter interface.
 *
 * Also handles pre_sol via ptype=p,r (the SAM API returns both
 * solicitations and pre-solicitations in the same search).
 */

import type {
  SolicitationAdapter,
  FetchOpts,
  NormalizedOpportunity,
} from '../adapter/types.js';
import { fetchOpportunities } from './client.js';
import { mapSAMOpportunity } from './mapper.js';
import type { SAMOpportunityRaw } from './types.js';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export class SamSolicitationAdapter
  implements SolicitationAdapter<SAMOpportunityRaw>
{
  readonly source = 'sam.gov' as const;
  readonly defaultStage = 'solicitation' as const;

  async fetchRecent(opts: FetchOpts): Promise<SAMOpportunityRaw[]> {
    const toDate = opts.toDate ?? new Date();
    const fromDate =
      opts.fromDate ?? new Date(toDate.getTime() - DEFAULT_LOOKBACK_MS);
    return fetchOpportunities(fromDate, toDate);
  }

  normalize(raw: SAMOpportunityRaw): NormalizedOpportunity {
    const { opportunity, citations } = mapSAMOpportunity(raw);
    return {
      externalId: opportunity.sam_notice_id,
      title: opportunity.title,
      agency: opportunity.agency,
      subAgency: opportunity.sub_agency,
      department: opportunity.department,
      solicitationNumber: opportunity.solicitation_number,
      status: opportunity.status,
      valueMin: opportunity.value_min,
      valueMax: opportunity.value_max,
      naics: opportunity.naics,
      psc: opportunity.psc,
      setAside: opportunity.set_aside,
      placeOfPerformance: opportunity.place_of_performance,
      responseDueAt: opportunity.response_due_at,
      postedAt: opportunity.posted_at,
      description: opportunity.description,
      dataSource: opportunity.data_source,
      tags: opportunity.tags,
      sourceUrl: citations[0]?.source_url ?? null,
      citations: citations.map((c) => ({
        field: c.field,
        sourceUrl: c.source_url,
      })),
    };
  }
}
