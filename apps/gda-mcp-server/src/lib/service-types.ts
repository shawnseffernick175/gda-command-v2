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

// ─── action-items/index.ts ──────────────────────────────────────────────────

export interface ActionItemRow {
  id: string;
  title: string;
  detail: string | null;
  owner: string;
  status: 'open' | 'in_progress' | 'done';
  due_date: string | null;
  source: string;
  source_id: string | null;
  linked_record_type: string | null;
  linked_record_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItemListFilters {
  status?: string;
  owner?: string;
  source?: string;
  linked_record_type?: string;
  limit: number;
  cursor?: string;
}

// ─── drafts/index.ts ────────────────────────────────────────────────────────

export interface DraftRow {
  id: number;
  action_item_id: number;
  kind: string;
  content: string;
  model_used: string | null;
  approved_by: string | null;
  approved_at: string | null;
  source_id: number;
  status: string;
  created_at: string;
}

// ─── pipeline/types.ts ──────────────────────────────────────────────────────

export interface PipelineListFilters {
  capture_owner?: string;
  opportunity_agency?: string;
  opportunity_naics?: string;
  opportunity_set_aside?: string;
  due_after?: string;
  due_before?: string;
  limit: number;
  cursor?: string;
}

export interface PipelineResult {
  items: object[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

// ─── color-teams/types.ts ───────────────────────────────────────────────────

export interface ColorTeamRunRow {
  id: string;
  document_id: string;
  linked_rfp_id: string | null;
  colors: string[];
  status: string;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  source_id: string | null;
  created_at: string;
}

// ─── launchpad/summary.ts ───────────────────────────────────────────────────

export interface LaunchpadSummary {
  qualified_due_this_week: number;
  qualified_due_this_week_sources: object[];
  pipeline_no_capture: number;
  pipeline_no_capture_sources: object[];
  captures_color_review_stale: number;
  captures_color_review_stale_sources: object[];
  action_items_open_today: number;
  action_items_open_today_sources: object[];
  action_items_overdue: number;
  action_items_overdue_sources: object[];
}

// ─── memory/types.ts ────────────────────────────────────────────────────────

export interface AgentDecisionRow {
  id: string;
  kind: string;
  entity_kind: string;
  entity_id: string;
  rationale: string;
  evidence_refs: object[];
  doctrine_alignment_score: number | null;
  exclusion_triggers: object[] | null;
  margin_check: object | null;
  made_by: string;
  made_at: string;
  outcome: string | null;
  outcome_recorded_at: string | null;
  outcome_evidence_refs: object[] | null;
  parent_decision_id: string | null;
  agent_run_id: string | null;
}
