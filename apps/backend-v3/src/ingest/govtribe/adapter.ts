/**
 * GovTribeSolicitationAdapter — STUB.
 *
 * Full adapter migration is blocked by F-323. The existing GovTribe
 * ingest continues to run through the framework registry
 * (registerGovTribeSource). This stub is registered so the adapter
 * registry can list and dispatch it.
 */

import type {
  SolicitationAdapter,
  FetchOpts,
  NormalizedOpportunity,
} from '../adapter/types.js';
import type { GovTribeOpportunityRaw } from './types.js';

export class GovTribeSolicitationAdapter
  implements SolicitationAdapter<GovTribeOpportunityRaw>
{
  readonly source = 'govtribe' as const;
  readonly defaultStage = 'solicitation' as const;

  async fetchRecent(_opts: FetchOpts): Promise<GovTribeOpportunityRaw[]> {
    // Stubbed — blocked by F-323.
    // The existing GovTribe ingest runs through the framework registry.
    return [];
  }

  normalize(raw: GovTribeOpportunityRaw): NormalizedOpportunity {
    const id = raw._id ?? raw.id ?? '';
    const attrs = raw.attributes ?? {};
    const sourceUrl = `https://govtribe.com/opportunity/${attrs.slug ?? id}`;
    return {
      externalId: id,
      title: attrs.title ?? 'Untitled GovTribe Opportunity',
      agency: attrs.agency?.name ?? null,
      subAgency: attrs.agency?.subTier ?? null,
      department: null,
      solicitationNumber: attrs.solicitationNumber ?? null,
      status: 'discovery',
      valueMin: attrs.estimatedValue?.low ?? attrs.awardAmount ?? null,
      valueMax: attrs.estimatedValue?.high ?? attrs.awardAmount ?? null,
      naics: attrs.naicsCode ?? null,
      psc: attrs.pscCode ?? null,
      setAside: attrs.setAside ?? null,
      placeOfPerformance: attrs.placeOfPerformance ?? null,
      responseDueAt: attrs.responseDate ?? null,
      postedAt: attrs.postedDate ?? null,
      description: attrs.description ?? null,
      dataSource: 'govtribe',
      tags: ['govtribe'],
      sourceUrl,
      citations: [{ field: 'title', sourceUrl }],
    };
  }
}
