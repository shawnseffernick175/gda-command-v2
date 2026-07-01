/**
 * F-313: Output Generators — types
 */

export type GeneratedDocType = 'briefing' | 'capture_plan' | 'win_themes';

export interface Citation {
  index: number;
  source: string;
  url: string;
  retrieved_at: string;
}

export interface DoctrineRef {
  principle: string;
  relevance: string;
}

export interface GeneratedDocumentRow {
  id: string;
  doc_type: GeneratedDocType;
  opportunity_id: string | null;
  capture_id: string | null;
  title: string;
  html_content: string;
  citations: Citation[];
  doctrine_refs: DoctrineRef[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefingData {
  opportunity_id: string;
  title: string;
  agency: string | null;
  department: string | null;
  naics: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  pwin: number | null;
  description: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  source_uri: string | null;
  solicitation_number: string | null;
  place_of_performance: string | null;
  analysis_summary: string | null;
  analysis_sections: AnalysisSection[];
  doctrine_alignment: DoctrineRef[];
  risks: string[];
  recommended_action: string | null;
}

export interface AnalysisSection {
  heading: string;
  content: string;
  citations: Citation[];
}

export interface CapturePlanData {
  capture_id: string;
  opportunity_id: string;
  title: string;
  agency: string | null;
  value: number | null;
  pwin: number | null;
  stage: string;
  win_strategy: string | null;
  discriminators: string[];
  capture_plan: Record<string, unknown> | null;
  incumbent: string | null;
  competitors: CompetitorInfo[];
  win_themes: string[];
  teaming_partners: string[];
  risks: string[];
  schedule_milestones: string[];
  decision_factors: string[];
  doctrine_alignment: DoctrineRef[];
  analysis_sections: AnalysisSection[];
}

export interface CompetitorInfo {
  name: string;
  strengths: string[];
  weaknesses: string[];
}

export interface WinThemeData {
  capture_id: string;
  opportunity_id: string;
  title: string;
  agency: string | null;
  themes: WinTheme[];
  doctrine_alignment: DoctrineRef[];
}

export interface WinTheme {
  theme_title: string;
  narrative: string;
  evidence: string[];
  doctrine_principle: string | null;
  has_evidence: boolean;
}
