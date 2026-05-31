/**
 * Decision Memory types — F-302.
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

export interface MarginCheck {
  passed: boolean;
  margin_pct: number;
  threshold: number;
}

export interface ExclusionTrigger {
  exclusion_id: string;
  override_rationale?: string;
}

export interface AgentDecisionRow {
  id: string;
  kind: DecisionKind;
  entity_kind: EntityKind;
  entity_id: string;
  rationale: string;
  evidence_refs: EvidenceRef[];
  doctrine_alignment_score: number | null;
  exclusion_triggers: ExclusionTrigger[] | null;
  margin_check: MarginCheck | null;
  made_by: string;
  made_at: string;
  outcome: DecisionOutcome | null;
  outcome_recorded_at: string | null;
  outcome_evidence_refs: EvidenceRef[] | null;
  parent_decision_id: string | null;
  agent_run_id: string | null;
}

export interface DecisionCreateInput {
  kind: DecisionKind;
  entity_kind: EntityKind;
  entity_id: string;
  rationale: string;
  evidence_refs?: EvidenceRef[];
  doctrine_alignment_score?: number;
  exclusion_triggers?: ExclusionTrigger[];
  margin_check?: MarginCheck;
  made_by: string;
  parent_decision_id?: string;
  agent_run_id?: string;
}

export interface DecisionOutcomeInput {
  outcome: DecisionOutcome;
  outcome_value?: number;
  outcome_evidence_refs?: EvidenceRef[];
}

export interface DecisionListFilters {
  entity_kind?: EntityKind;
  entity_id?: string;
  kind?: DecisionKind;
  since?: string;
  limit?: number;
  offset?: number;
}
