export interface PrincipleScore {
  score: number;
  rationale: string;
  evidence_grade: 'A' | 'B' | 'C';
  citations: string[];
}

export interface ExclusionResult {
  id: string;
  name: string;
  triggered: boolean;
  evidence: string[];
  override_available: boolean;
}

export interface MarginCheck {
  passed: boolean;
  margin_pct: number | null;
  threshold: number;
  source: string;
}

export interface DoctrineEvaluation {
  id: string;
  entity_kind: string;
  entity_id: string;
  agent_run_id: string | null;
  principle_scores: Record<string, PrincipleScore>;
  alignment_total: number;
  exclusion_triggers: ExclusionResult[];
  margin_check: MarginCheck;
  evidence_grades: Record<string, 'A' | 'B' | 'C'>;
  recommendations: string[];
  evaluated_at: string;
}

export interface DoctrinePrinciple {
  id: string;
  name: string;
  short_form: string;
  long_form: string;
  evaluation_prompt: string;
  display_order: number;
}

export interface DoctrineExclusion {
  id: string;
  name: string;
  description: string;
  trigger_logic_prompt: string;
  applies_to_ous: string[];
  is_hard_block: boolean;
  override_requires: string | null;
}

export interface DoctrineConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}
