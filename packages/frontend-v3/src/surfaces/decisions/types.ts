/**
 * Decision Memory + PWin types — F-302.
 */

export type DecisionKind =
  | 'qualify' | 'kill' | 'pass' | 'bid' | 'no_bid'
  | 'team_with' | 'avoid_team' | 'win' | 'loss'
  | 'withdraw' | 'exclusion_override';

export type EntityKind =
  | 'opportunity' | 'pursuit' | 'capture'
  | 'partner' | 'document' | 'pipeline_item';

export type DecisionOutcome = 'won' | 'lost' | 'withdrawn' | 'no_award';

export interface EvidenceRef {
  source_url: string;
  source_type: string;
  grade?: string;
}

export interface AgentDecision {
  id: string;
  kind: DecisionKind;
  entity_kind: EntityKind;
  entity_id: string;
  rationale: string;
  evidence_refs: EvidenceRef[];
  doctrine_alignment_score: number | null;
  exclusion_triggers: Array<{ exclusion_id: string; override_rationale?: string }> | null;
  margin_check: { passed: boolean; margin_pct: number; threshold: number } | null;
  made_by: string;
  made_at: string;
  outcome: DecisionOutcome | null;
  outcome_recorded_at: string | null;
  outcome_evidence_refs: EvidenceRef[] | null;
  parent_decision_id: string | null;
  agent_run_id: string | null;
}

export interface RuleContribution {
  name: string;
  value: number;
  description: string;
}

export interface PwinScoreResult {
  score: number;
  model_version: string;
  feature_weights?: RuleContribution[];
  top_drivers?: string[];
  confidence: number | null;
}

export interface PwinModelInfo {
  active_version: string;
  model_kind: string;
  trained_at: string;
  trained_on_outcomes_count: number | null;
  metrics: Record<string, number> | null;
}

export const DECISION_KIND_LABELS: Record<DecisionKind, string> = {
  qualify: 'Qualify',
  kill: 'Kill',
  pass: 'Pass',
  bid: 'Bid',
  no_bid: 'No Bid',
  team_with: 'Team With',
  avoid_team: 'Avoid Team',
  win: 'Win',
  loss: 'Loss',
  withdraw: 'Withdraw',
  exclusion_override: 'Exclusion Override',
};
