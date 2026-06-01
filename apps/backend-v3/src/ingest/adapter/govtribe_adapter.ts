/**
 * GovTribe adapter — normalizes legacy `opportunities` rows where
 * data_source = 'govtribe'.
 */

import type {
  SourceAdapter,
  LegacyOpportunityRow,
  NormalizedOpportunity,
  LifecycleStage,
} from './types.js';

function valueToCents(val: number | null): number | null {
  if (val === null || val === undefined) return null;
  return Math.round(val * 100);
}

function inferStage(row: LegacyOpportunityRow): LifecycleStage {
  const s = row.status?.toLowerCase() ?? '';
  if (s === 'awarded') return 'awarded';
  if (s === 'closed' || s === 'no_bid') return 'closed';
  return 'solicitation';
}

export const govtribeAdapter: SourceAdapter = {
  source: 'govtribe',
  defaultStage: 'solicitation',

  normalize(row: LegacyOpportunityRow): NormalizedOpportunity {
    const nativeId = row.govtribe_id ?? row.external_id ?? `govtribe-legacy-${row.id}`;

    return {
      source: 'govtribe',
      sourceNativeId: nativeId,
      lifecycleStage: inferStage(row),
      title: row.title ?? null,
      agency: row.agency ?? null,
      office: row.sub_agency ?? null,
      solicitationNumber: row.solicitation_number ?? null,
      naics: row.naics ?? null,
      psc: row.psc ?? null,
      setAside: row.set_aside ?? null,
      estimatedValueCents: valueToCents(row.value_max ?? row.value_min),
      postedAt: row.posted_at ?? null,
      responseDueAt: row.response_due_at ?? null,
      awardAt: null,
      description: row.description ?? null,
    };
  },
};
