/**
 * PWin types — F-302.
 */

export interface PwinFeatures {
  vehicle: string;
  has_vehicle_access: boolean;
  vehicle_set_aside: string;
  agency: string;
  sub_agency: string;
  is_existing_customer: boolean;
  naics: string;
  ceiling_value_m: number;
  is_recompete: boolean;
  is_incumbent: boolean;
  incumbent_competitor: string;
  scope_match_score: number;
  days_to_rfp_release: number;
  days_to_proposal_due: number;
  is_under_continuing_resolution: boolean;
  core_offering_match: string[];
  clearance_required: string;
  clearance_fit: boolean;
  doctrine_alignment_score: number;
  exclusion_triggered: boolean;
  exclusion_ids: string[];
  expected_margin_pct: number;
  below_margin_floor: boolean;
  needs_teaming_partner: boolean;
  candidate_partners: string[];
  named_competitors_count: number;
  competitor_incumbency_rate: number;
  similar_awards_count: number;
  avg_similar_award_value_m: number;
}

export interface PwinFeatureRow {
  id: string;
  opportunity_id: string;
  features: PwinFeatures;
  computed_at: string;
}

export interface PwinOutcomeRow {
  id: string;
  opportunity_id: string;
  feature_snapshot_id: string;
  outcome: string;
  outcome_value: number | null;
  decision_id: string | null;
  recorded_at: string;
}

export interface PwinModelVersionRow {
  id: string;
  version: string;
  model_kind: string;
  trained_at: string;
  trained_on_outcomes_count: number | null;
  feature_schema: Record<string, string>;
  model_blob: Buffer | null;
  rules_config: Record<string, number> | null;
  metrics: Record<string, number> | null;
  is_active: boolean;
  notes: string | null;
}

export interface RuleContribution {
  name: string;
  value: number;
  description: string;
}

export interface PwinScoreResult {
  score: number;
  model_version: string;
  feature_weights: RuleContribution[];
  top_drivers: string[];
  confidence: number | null;
}

export interface PwinModelInfo {
  active_version: string;
  model_kind: string;
  trained_at: string;
  trained_on_outcomes_count: number | null;
  metrics: Record<string, number> | null;
}

export interface RetrainResult {
  new_version: string;
  promoted: boolean;
  metrics: Record<string, number>;
}
