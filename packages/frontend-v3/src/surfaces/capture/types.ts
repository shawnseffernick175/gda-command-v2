import type { SourceRef } from '../../lib/api-client';

export type ColorStage = 'pink' | 'red' | 'gold' | 'submitted';

export interface Source {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface CaptureListItem {
  id: string;
  pipeline_item_id: string;
  pipeline_capture_owner: string | null;
  opportunity_title: string | null;
  opportunity_title_sources: Source[];
  opportunity_agency: string | null;
  opportunity_agency_sources: Source[];
  color_stage: ColorStage;
  pwin: number | null;
  ai_analyzed_at: string | null;
  analysis_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptureListResponse {
  success: boolean;
  data: {
    items: CaptureListItem[];
    pagination: {
      limit: number;
      cursor: string | null;
      hasMore: boolean;
    };
    total?: number;
    limit?: number;
    offset?: number;
  };
  meta: { generatedAt: string; source: string; requestId: string };
}

export interface ComplianceRequirement {
  id: string;
  requirement: string;
  section_ref: string | null;
  status: string;
  response_notes: string | null;
  assigned_to: string | null;
  source_id: string;
}

export interface PricingData {
  labor_categories: { id?: string; category: string; hours: number; rate: number }[];
  total: number;
  benchmark_band_low: number;
  benchmark_band_high: number;
  total_sources: Source[];
  benchmark_sources: Source[];
}

export interface TeamingPartner {
  id?: string;
  name: string;
  role: 'prime' | 'sub' | 'mentor';
  source_url?: string;
  source_url_sources?: Source[];
}

export interface CaptureDetail {
  id: string;
  pipeline_item_id: string;
  pipeline_capture_owner: string | null;
  opportunity_title: string | null;
  opportunity_title_sources: Source[];
  opportunity_agency: string | null;
  opportunity_agency_sources: Source[];
  color_stage: ColorStage;
  capture_plan: Record<string, unknown>;
  pricing_notes: string | null;
  compliance_status: string;
  win_themes: string[];
  ghost_team: Record<string, unknown> | null;
  compliance_items: ComplianceRequirement[];
  pwin: number | null;
  ai_analyzed_at: string | null;
  analysis_version: string | null;
  source_url?: string;
  source_url_sources?: Source[];
  pwin_sources?: Source[];
  compliance_sources?: Source[];
  compliance_coverage?: number;
  pricing?: PricingData;
  teaming_partners?: TeamingPartner[];
  created_at: string;
  updated_at: string;
}

export interface AnalysisResult {
  pwin: number;
  pwin_sources: SourceRef[];
  color_stage: ColorStage;
  compliance_coverage: number;
  compliance_sources: SourceRef[];
}
