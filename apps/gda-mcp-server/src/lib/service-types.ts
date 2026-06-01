/**
 * Local type declarations for backend-v3 service outputs.
 * These mirror the canonical types in backend-v3 to avoid pulling
 * the entire backend-v3 type graph into tsc (which OOMs).
 */

// ─── merge.ts (F-405) ──────────────────────────────────────────────────────

export interface MergedOpportunity {
  internal_id: string;
  lifecycle_stage: string;
  primary_source: string | null;
  title: string | null;
  agency: string | null;
  office: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  estimated_value_cents: number | null;
  posted_at: string | null;
  response_due_at: string | null;
  award_at: string | null;
  pwin: number | null;
  doctrine_status: string | null;
  created_at: string;
  updated_at: string;
  field_sources: Record<string, string>;
  links: Array<{
    id: number;
    internal_id: string;
    source: string;
    source_native_id: string;
    confidence: string | null;
    match_method: string | null;
    matched_at: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
  }>;
}

// ─── doctrine/evaluate.ts ───────────────────────────────────────────────────

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

// ─── pwin/types.ts ──────────────────────────────────────────────────────────

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

// ─── rag/types.ts ───────────────────────────────────────────────────────────

export interface SearchResult {
  chunk_id: string;
  chunk_text: string;
  document_id: string;
  source_filename: string;
  source_url: string | null;
  doc_type: string;
  evidence_grade: string | null;
  page_number: number | null;
  section_title: string | null;
  score: number;
}
