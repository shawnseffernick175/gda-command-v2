export interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export type ColorReviewPhase = 'none' | 'blue' | 'pink' | 'red' | 'gold';

export interface CaptureListItem {
  id: string;
  opportunity_title: string;
  agency: string;
  response_date: string;
  color_review_phase: ColorReviewPhase;
  compliance_coverage: number;
  pwin: number;
  last_analyzed: string | null;
  source_url: string;
  source_url_sources: SourceCitation[];
}

export interface CaptureListResponse {
  items: CaptureListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ColorReviewFinding {
  id: string;
  phase: ColorReviewPhase;
  finding: string;
  severity: 'critical' | 'major' | 'minor';
  source_url: string;
  source_url_sources: SourceCitation[];
}

export interface ComplianceRequirement {
  id: string;
  requirement: string;
  met: boolean;
  source_citation: string;
  source_url: string;
  source_url_sources: SourceCitation[];
}

export interface LaborCategory {
  id: string;
  category: string;
  hours: number;
  rate: number;
}

export interface PricingData {
  labor_categories: LaborCategory[];
  total: number;
  benchmark_band_low: number;
  benchmark_band_high: number;
  total_sources: SourceCitation[];
  benchmark_sources: SourceCitation[];
}

export interface TeamingPartner {
  id: string;
  name: string;
  role: 'prime' | 'sub' | 'mentor' | 'protege' | 'teaming';
  source_url: string;
  source_url_sources: SourceCitation[];
}

export interface CaptureDetail {
  id: string;
  opportunity_title: string;
  agency: string;
  response_date: string;
  color_review_phase: ColorReviewPhase;
  compliance_coverage: number;
  pwin: number;
  last_analyzed: string | null;
  source_url: string;
  source_url_sources: SourceCitation[];
  pwin_sources: SourceCitation[];
  compliance_sources: SourceCitation[];
  color_review_findings: ColorReviewFinding[];
  compliance_requirements: ComplianceRequirement[];
  pricing: PricingData;
  teaming_partners: TeamingPartner[];
}

export interface AnalysisResult {
  pwin: number;
  pwin_sources: SourceCitation[];
  color_review_phase: ColorReviewPhase;
  compliance_coverage: number;
  compliance_sources: SourceCitation[];
  pricing_band: string;
  pricing_band_sources: SourceCitation[];
  teaming_recommendation: string;
  teaming_recommendation_sources: SourceCitation[];
}
