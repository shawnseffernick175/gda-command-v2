/**
 * F-305: Opportunity Auto-Analysis types — 10-section decision brief.
 */

import type { SourceRef } from '../../lib/sources.js';

export interface AnalysisSectionBase {
  section_id: string;
  section_label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'stale';
  trace_id: string | null;
  cached: boolean;
  stale: boolean;
  error_message?: string | null;
  generated_at: string | null;
}

export interface PwinSection extends AnalysisSectionBase {
  section_id: 'pwin';
  data: {
    score: number;
    grade: 'Go' | 'Reconsider' | 'Pass';
    top_factors: string[];
    model_version: string;
    citations: SourceRef[];
  } | null;
}

export interface DoctrineSection extends AnalysisSectionBase {
  section_id: 'doctrine';
  data: {
    principles: Array<{
      id: string;
      name: string;
      result: 'pass' | 'fail' | 'n/a';
      reason: string;
      citations: SourceRef[];
    }>;
    exclusions: Array<{
      id: string;
      name: string;
      result: 'pass' | 'fail' | 'n/a';
      reason: string;
    }>;
    margin_floor: {
      passed: boolean;
      margin_pct: number | null;
      threshold: number;
    };
    citations: SourceRef[];
  } | null;
}

export interface IncumbentSection extends AnalysisSectionBase {
  section_id: 'incumbent';
  data: {
    company_name: string | null;
    contract_number: string | null;
    ceiling: number | null;
    end_date: string | null;
    performance_signals: string[];
    citations: SourceRef[];
  } | null;
}

export interface SimilarAwardsSection extends AnalysisSectionBase {
  section_id: 'similar_awards';
  data: {
    awards: Array<{
      title: string;
      date: string | null;
      agency: string | null;
      value: number | null;
      awardee: string | null;
      url: string | null;
    }>;
    citations: SourceRef[];
  } | null;
}

export interface CompetitorsSection extends AnalysisSectionBase {
  section_id: 'competitors';
  data: {
    competitors: Array<{
      name: string;
      win_rate: number | null;
      cleared: boolean | null;
      ceiling_fit: string | null;
      threat_level: 'high' | 'medium' | 'low';
    }>;
    citations: SourceRef[];
  } | null;
}

export interface DecisionFactorsSection extends AnalysisSectionBase {
  section_id: 'decision_factors';
  data: {
    evaluation_method: string | null;
    past_performance_weight: string | null;
    key_personnel_requirements: string | null;
    other_factors: string[];
    citations: SourceRef[];
  } | null;
}

export interface TeamingSection extends AnalysisSectionBase {
  section_id: 'teaming';
  data: {
    opportunities: Array<{
      partner: string;
      ou: string;
      rationale: string;
      cert_leverage: string | null;
    }>;
    citations: SourceRef[];
  } | null;
}

export interface WinThemesSection extends AnalysisSectionBase {
  section_id: 'win_themes';
  data: {
    themes: Array<{
      theme: string;
      doctrine_anchor: string | null;
    }>;
    citations: SourceRef[];
  } | null;
}

export interface RisksSection extends AnalysisSectionBase {
  section_id: 'risks';
  data: {
    risks: Array<{
      title: string;
      severity: 'HIGH' | 'MED' | 'LOW';
      description: string;
      mitigation: string | null;
      linked_risk_id: string | null;
    }>;
    citations: SourceRef[];
  } | null;
}

export interface CitationsSection extends AnalysisSectionBase {
  section_id: 'citations';
  data: {
    all_citations: SourceRef[];
  } | null;
}

export type AnalysisSection =
  | PwinSection
  | DoctrineSection
  | IncumbentSection
  | SimilarAwardsSection
  | CompetitorsSection
  | DecisionFactorsSection
  | TeamingSection
  | WinThemesSection
  | RisksSection
  | CitationsSection;

export type SectionId = AnalysisSection['section_id'];

export const SECTION_ORDER: SectionId[] = [
  'pwin',
  'doctrine',
  'incumbent',
  'similar_awards',
  'competitors',
  'decision_factors',
  'teaming',
  'win_themes',
  'risks',
  'citations',
];

export const SECTION_LABELS: Record<SectionId, string> = {
  pwin: 'PWin Score',
  doctrine: 'Doctrine Alignment',
  incumbent: 'Incumbent',
  similar_awards: 'Similar Awards',
  competitors: 'Competitors',
  decision_factors: 'Decision Factors',
  teaming: 'Teaming Opportunities',
  win_themes: 'Doctrine-Aligned Win Themes',
  risks: 'Risks',
  citations: 'Citations',
};

export interface FullAnalysisBrief {
  opportunity_id: string;
  sections: AnalysisSection[];
  sources_revision_hash: string | null;
  generated_at: string;
  cached: boolean;
}
