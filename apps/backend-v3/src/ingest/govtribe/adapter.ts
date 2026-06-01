/**
 * GovTribeSolicitationAdapter — wraps the new MCP client (mcp_client.callTool)
 * behind the SourceAdapter interface.
 *
 * Uses the typed MCP wrapper functions from mcp_tools.ts for fetch,
 * and the existing mapper.ts for normalisation.
 */

import type {
  SolicitationAdapter,
  FetchOpts,
  RawRecord,
  NormalizedOpportunity,
} from '../adapter/types.js';
import { searchOpportunities } from './mcp_tools.js';
import { resetCycleCredits } from './mcp_client.js';
import { mapGovTribeOpportunity } from './mapper.js';
import type { GovTribeOpportunityRaw } from './types.js';
import { GOVTRIBE_SAVED_SEARCHES } from './saved_searches.js';

export class GovTribeSolicitationAdapter implements SolicitationAdapter {
  readonly source = 'govtribe' as const;
  readonly defaultStage = 'solicitation' as const;

  async fetchRecent(opts: FetchOpts): Promise<RawRecord[]> {
    resetCycleCredits();

    const allRaws: RawRecord[] = [];
    const limit = opts.limit ?? 50;

    for (const search of GOVTRIBE_SAVED_SEARCHES) {
      if (search.category !== 'opportunities') continue;

      const cacheId = `saved_search_${search.id}`;
      const result = await searchOpportunities(
        { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage: limit },
        cacheId,
      );

      if (
        result.decision === 'skipped_low_budget' ||
        result.decision === 'skipped_halted' ||
        result.decision === 'skipped_cycle_cap'
      ) {
        break;
      }

      const responseData = result.data as Record<string, unknown> | null;
      const rows = (
        responseData?.data ??
        responseData?.rows ??
        (Array.isArray(responseData) ? responseData : [])
      ) as RawRecord[];

      allRaws.push(...rows);
    }

    return allRaws;
  }

  normalize(raw: RawRecord): NormalizedOpportunity | null {
    const govtribeRaw = raw as unknown as GovTribeOpportunityRaw;
    const mapped = mapGovTribeOpportunity(govtribeRaw);
    if (!mapped) return null;

    const opp = mapped.opportunity;

    const valueCents = opp.value_min !== null
      ? Math.round(opp.value_min * 100)
      : null;

    return {
      source_native_id: mapped.govtribe_id,
      lifecycle_stage: this.defaultStage,
      title: opp.title,
      agency: opp.agency,
      office: opp.agency_subtype,
      naics: opp.naics,
      psc: opp.psc,
      set_aside: opp.set_aside,
      estimated_value_cents: valueCents,
      posted_at: opp.posted_at,
      response_due_at: opp.response_due_at,
      award_at: null,
      source_url: mapped.source_uri,
      description: opp.description,
    };
  }
}
