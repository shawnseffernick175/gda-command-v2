export interface SourceRef {
  kind: string;
  title: string | null;
  url: string | null;
  retrieved_at: string;
}

export interface Milestone {
  name: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface PipelineItem {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_title_sources: SourceRef[];
  opportunity_agency: string | null;
  opportunity_agency_sources: SourceRef[];
  opportunity_naics: string | null;
  opportunity_naics_sources: SourceRef[];
  opportunity_set_aside: string | null;
  opportunity_set_aside_sources: SourceRef[];
  opportunity_due_at: string | null;
  opportunity_due_at_sources: SourceRef[];
  opportunity_value_min: number | null;
  opportunity_value_min_sources: SourceRef[];
  opportunity_value_max: number | null;
  opportunity_value_max_sources: SourceRef[];
  capture_owner: string;
  capture_owner_sources: SourceRef[];
  win_prob_pct: number | null;
  win_prob_pct_sources: SourceRef[];
  win_prob_evidence: string | null;
  win_prob_evidence_sources: SourceRef[];
  stage: string;
  milestones: Milestone[];
  teaming_partners: string[];
  pwin_score: number | null;
  pwin_band: string | null;
  solicitation_number: string | null;
  resolved_value: number;
  resolved_pwin: number | null;
  resolved_weighted: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineListFilters {
  capture_owner?: string;
  opportunity_agency?: string;
  opportunity_naics?: string;
  opportunity_set_aside?: string;
  due_after?: string;
  due_before?: string;
  stage?: string;
  q?: string;
  is_idiq?: boolean;
  limit: number;
  cursor?: string;
}

export interface PipelineCreateInput {
  opportunity_id: string;
  capture_owner: string;
  milestones?: Milestone[];
  win_prob_pct?: number;
  win_prob_evidence?: string;
  teaming_partners?: string[];
}

export interface PipelineUpdateInput {
  capture_owner?: string;
  milestones?: Milestone[];
  win_prob_pct?: number;
  win_prob_evidence?: string;
  teaming_partners?: string[];
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface PipelineRow {
  id: string;
  opportunity_id: string;
  capture_owner: string;
  win_probability: string | null;
  win_prob_evidence: string | null;
  milestone_90day: string | null;
  source_id: string;
  created_at: string;
  updated_at: string;
  opportunity_title: string;
  opportunity_agency: string | null;
  opportunity_naics: string | null;
  opportunity_set_aside: string | null;
  opportunity_due_at: string | null;
  opportunity_value_min: string | null;
  opportunity_value_max: string | null;
  opportunity_ai_analyzed_at: string | null;
  opportunity_analysis_version: string | null;
  opportunity_title_sources: SourceRef[] | null;
  opportunity_agency_sources: SourceRef[] | null;
  opportunity_naics_sources: SourceRef[] | null;
  opportunity_set_aside_sources: SourceRef[] | null;
  opportunity_due_at_sources: SourceRef[] | null;
  opportunity_value_min_sources: SourceRef[] | null;
  opportunity_value_max_sources: SourceRef[] | null;
  pipeline_source_kind: string | null;
  pipeline_source_title: string | null;
  pipeline_source_url: string | null;
  pipeline_source_retrieved_at: string | null;
  teaming_partners: string[] | null;
  stage: string;
  pwin_score: string | null;
  pwin_band: string | null;
  solicitation_number: string | null;
  estimated_value: string | null;
  pwin_override: string | null;
}
