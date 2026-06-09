import type { SourceRef } from '../../lib/sources.js';

export interface OpportunityRow {
  id: string;
  title: string;
  agency: string | null;
  department: string | null;
  sub_agency: string | null;
  department_name: string | null;
  agency_name: string | null;
  office: string | null;
  contracting_office: string | null;
  org_path: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  status: string;
  grade: string | null;
  grade_evidence: string | null;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  incumbent: string | null;
  description: string | null;
  tags: string[];
  data_source: string;
  analysis: AnalysisBlock | null;
  analysis_version: string | null;
  ai_analyzed_at: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  source_uri: string | null;
  source_id: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisBlock {
  version: string;
  generated_at: string;
  pwin: number;
  pwin_sources: SourceRef[];
  incumbent: string | null;
  incumbent_sources: SourceRef[];
  competitors: Competitor[];
  competitors_sources: SourceRef[];
  blackhat: BlackhatAssessment | null;
  blackhat_sources: SourceRef[];
  wargame: WargameOutput | null;
  wargame_sources: SourceRef[];
  timeline: Timeline | null;
  timeline_sources: SourceRef[];
}

export interface Competitor {
  name: string;
  threat_level: 'low' | 'medium' | 'high';
}

export interface BlackhatAssessment {
  envision_fit: string;
  competitor_strength: string;
  risk_areas: string[];
}

export interface WargameOutput {
  strategy: string;
  win_themes: string[];
  discriminators: string[];
}

export interface Timeline {
  rfp_release: string | null;
  proposals_due: string | null;
  award_estimate: string | null;
}

export interface TeamingFlag {
  id: string;
  reason: string;
  suggested_partner: string;
  detail: string;
}

export interface OpportunitySummary {
  id: string;
  title: string;
  title_sources: SourceRef[];
  agency: string | null;
  agency_sources: SourceRef[];
  department: string | null;
  agency_name: string | null;
  office: string | null;
  contracting_office: string | null;
  naics: string | null;
  naics_sources: SourceRef[];
  set_aside: string | null;
  set_aside_sources: SourceRef[];
  grade: string | null;
  grade_sources: SourceRef[];
  status: string;
  response_due_at: string | null;
  response_due_at_sources: SourceRef[];
  value_min: number | null;
  value_min_sources: SourceRef[];
  value_max: number | null;
  value_max_sources: SourceRef[];
  teaming_flags: TeamingFlag[];
  ai_analyzed_at: string | null;
  analysis_version: string | null;
  source_uri: string | null;
  deadline_warning: boolean;
  created_at: string;
  updated_at: string;
  /** Latest cached win-probability for list display (0-100 score + band). */
  pwin?: { score: number; band: string } | null;
}

export interface OpportunityDetail extends OpportunitySummary {
  sam_notice_id: string | null;
  sub_agency: string | null;
  org_path: string | null;
  description: string | null;
  description_sources: SourceRef[];
  posted_at: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  grade_evidence: string | null;
  analysis: AnalysisBlock;
  llm_analysis?: unknown;
  llm_quality_flag?: string | null;
  llm_error_kind?: string | null;
  llm_error_message?: string | null;
}

export interface OpportunityCreateInput {
  title: string;
  source: string;
  sam_notice_id?: string;
  naics?: string;
  agency?: string;
  sub_agency?: string;
  description?: string;
  set_aside?: string;
  response_due_at?: string;
  posted_at?: string;
  value_min?: number;
  value_max?: number;
}

export interface OpportunityUpdateInput {
  title?: string;
  naics?: string;
  agency?: string;
  sub_agency?: string;
  description?: string;
  set_aside?: string;
  response_due_at?: string;
  value_min?: number;
  value_max?: number;
  solicitation_number?: string;
  sam_notice_id?: string;
  psc?: string;
  incumbent?: string;
  tags?: string[];
  stage?: string;
}

export interface ListFilters {
  q?: string;
  status?: string;
  agency?: string;
  department?: string;
  naics?: string;
  grade?: string;
  grades?: string[];
  due_before?: string;
  due_after?: string;
  due?: string;
  set_aside?: string;
  set_asides?: string[];
  min_value?: number;
  max_value?: number;
  hot?: string;
  sources?: string[];
  stage?: string;
  relevantOnly?: boolean;
  limit?: number;
  cursor?: string;
  page?: number;
  /** Column to sort the list by. Defaults to recency (id desc). */
  sort_by?: SortField;
  /** Sort direction. Defaults to desc. */
  sort_dir?: 'asc' | 'desc';
}

/** Sortable columns surfaced on the opportunities list. */
export type SortField =
  | 'value'
  | 'pwin'
  | 'stage'
  | 'due'
  | 'agency'
  | 'set_aside'
  | 'title'
  | 'recency';

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface OpportunityMeta {
  total_count: number;
  due_this_week: number;
  unscored_count: number;
  total_value: number;
  grade_a_count: number;
  stage_counts: Record<string, number>;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  meta?: OpportunityMeta;
}

export const ANALYSIS_AFFECTING_FIELDS = new Set([
  'title',
  'agency',
  'sub_agency',
  'solicitation_number',
  'sam_notice_id',
  'naics',
  'psc',
  'set_aside',
  'value_min',
  'value_max',
  'incumbent',
  'description',
  'tags',
  'response_due_at',
]);
