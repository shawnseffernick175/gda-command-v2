export interface SourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface TeamingFlag {
  id: string;
  reason: string;
  suggested_partner: string;
  detail: string;
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

export interface OpportunitySummary {
  id: string;
  title: string;
  title_sources: SourceRef[];
  agency: string | null;
  agency_sources: SourceRef[];
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
  created_at: string;
  updated_at: string;
}

export interface OpportunityDetail extends OpportunitySummary {
  sam_notice_id: string | null;
  sub_agency: string | null;
  description: string | null;
  description_sources: SourceRef[];
  posted_at: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  grade_evidence: string | null;
  analysis: AnalysisBlock;
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

export interface ListFilters {
  status?: string | undefined;
  agency?: string | undefined;
  naics?: string | undefined;
  grade?: string | undefined;
  due_before?: string | undefined;
  due_after?: string | undefined;
  set_aside?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
  sort?: string | undefined;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    generatedAt: string;
    source: string;
    requestId: string;
  };
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    detail?: string;
  };
  meta: {
    generatedAt: string;
    source: string;
    requestId: string;
  };
}
