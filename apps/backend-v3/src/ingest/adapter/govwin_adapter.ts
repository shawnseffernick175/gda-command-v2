/**
 * GovWin adapter — normalizes legacy `opportunities` rows where
 * data_source = 'govwin'.
 *
 * GovWin rows use `sam_notice_id` with a 'govwin-' prefix for dedup
 * in the legacy schema. We extract the GovWin native ID from that prefix.
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
  return 'forecast';
}

function extractGovwinNativeId(row: LegacyOpportunityRow): string {
  if (row.sam_notice_id?.startsWith('govwin-')) {
    return row.sam_notice_id.slice('govwin-'.length);
  }
  if (row.external_id) return row.external_id;
  return `govwin-legacy-${row.id}`;
}

export const govwinAdapter: SourceAdapter = {
  source: 'govwin',
  defaultStage: 'forecast',

  normalize(row: LegacyOpportunityRow): NormalizedOpportunity {
    return {
      source: 'govwin',
      sourceNativeId: extractGovwinNativeId(row),
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
