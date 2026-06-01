/**
 * Unified adapter interfaces for the opportunity lifecycle model (F-402).
 *
 * Every source (SAM, GovTribe, GovWin, …) implements SourceAdapter.
 * The `normalize()` method converts a raw DB row into a NormalizedOpportunity
 * suitable for the unified opportunities_unified + opportunity_links tables.
 */

export type LifecycleStage =
  | 'signal'
  | 'forecast'
  | 'pre_sol'
  | 'solicitation'
  | 'awarded'
  | 'post_award'
  | 'closed';

export interface NormalizedOpportunity {
  source: string;
  sourceNativeId: string;
  lifecycleStage: LifecycleStage;
  title: string | null;
  agency: string | null;
  office: string | null;
  solicitationNumber: string | null;
  naics: string | null;
  psc: string | null;
  setAside: string | null;
  estimatedValueCents: number | null;
  postedAt: string | null;
  responseDueAt: string | null;
  awardAt: string | null;
  description: string | null;
}

export interface SourceAdapter {
  readonly source: string;
  readonly defaultStage: LifecycleStage;

  /**
   * Normalize a raw row from the legacy `opportunities` table into the
   * canonical NormalizedOpportunity shape.
   */
  normalize(row: LegacyOpportunityRow): NormalizedOpportunity;
}

/**
 * Shape of a row selected from the existing `opportunities` table
 * (the legacy per-source table that we are backfilling from).
 */
export interface LegacyOpportunityRow {
  id: number;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  department: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  status: string;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  description: string | null;
  data_source: string;
  tags: string[];
  source_uri: string | null;
  govtribe_id: string | null;
  external_id: string | null;
  source_id: number;
  created_at: string;
  updated_at: string;
}
