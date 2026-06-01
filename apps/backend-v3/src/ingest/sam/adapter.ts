/**
 * SamSolicitationAdapter — wraps the existing SAM.gov client + mapper
 * behind the SourceAdapter interface.
 *
 * Handles both solicitations (ptype=o,k) and pre-solicitations (ptype=p,r)
 * via the SAM API type field.
 */

import type {
  SolicitationAdapter,
  FetchOpts,
  RawRecord,
  NormalizedOpportunity,
} from '../adapter/types.js';
import { fetchOpportunities } from './client.js';
import { mapSAMOpportunity } from './mapper.js';
import type { SAMOpportunityRaw } from './types.js';

const LOOKBACK_HOURS = 24;

const PRE_SOL_TYPES = new Set(['p', 'r', 'presolicitation', 'sources sought']);

export class SamSolicitationAdapter implements SolicitationAdapter {
  readonly source = 'sam' as const;
  readonly defaultStage = 'solicitation' as const;

  async fetchRecent(opts: FetchOpts): Promise<RawRecord[]> {
    const toDate = new Date();
    const fromDate = opts.since
      ? new Date(opts.since)
      : new Date(toDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

    const raws = await fetchOpportunities(fromDate, toDate);
    return raws as unknown as RawRecord[];
  }

  normalize(raw: RawRecord): NormalizedOpportunity | null {
    const samRaw = raw as unknown as SAMOpportunityRaw;
    if (!samRaw.noticeId) return null;

    const { opportunity } = mapSAMOpportunity(samRaw);

    const samType = (samRaw.type ?? '').toLowerCase();
    const stage = PRE_SOL_TYPES.has(samType) ? 'pre_sol' : this.defaultStage;

    const valueCents = opportunity.value_min !== null
      ? Math.round(opportunity.value_min * 100)
      : null;

    return {
      source_native_id: samRaw.noticeId,
      lifecycle_stage: stage,
      title: opportunity.title,
      agency: opportunity.agency,
      office: null,
      naics: opportunity.naics,
      psc: opportunity.psc,
      set_aside: opportunity.set_aside,
      estimated_value_cents: valueCents,
      posted_at: opportunity.posted_at,
      response_due_at: opportunity.response_due_at,
      award_at: null,
      source_url: samRaw.uiLink ?? `https://sam.gov/opp/${samRaw.noticeId}/view`,
      description: opportunity.description,
    };
  }
}
