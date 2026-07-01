/**
 * Capability catalog types — F-306.
 */

export type OU = 'envision' | 'riverstone' | 'pd_systems';
export type EvidenceGrade = 'A' | 'B' | 'C';

export interface Capability {
  id: string;
  ou: OU;
  name: string;
  category: string;
  description: string;
  naics_codes: string[];
  psc_codes: string[];
  agencies_strong_in: string[];
  past_performance_doc_ids: string[];
  key_personnel: string[];
  certifications: string[];
  evidence_grade: EvidenceGrade | null;
  active: boolean;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapabilityCreateInput {
  ou: OU;
  name: string;
  category: string;
  description: string;
  naics_codes?: string[];
  psc_codes?: string[];
  agencies_strong_in?: string[];
  past_performance_doc_ids?: string[];
  key_personnel?: string[];
  certifications?: string[];
  evidence_grade?: EvidenceGrade;
}

export interface CapabilityUpdateInput {
  name?: string;
  category?: string;
  description?: string;
  naics_codes?: string[];
  psc_codes?: string[];
  agencies_strong_in?: string[];
  past_performance_doc_ids?: string[];
  key_personnel?: string[];
  certifications?: string[];
  evidence_grade?: EvidenceGrade;
  active?: boolean;
  last_reviewed_at?: string;
}

export interface CapabilityMatch {
  opportunity_id: string;
  capability_id: string;
  match_score: number;
  match_reasons: MatchReason[];
  computed_at: string;
  capability?: Capability;
}

export interface MatchReason {
  factor: string;
  weight: number;
  detail: string;
}

export interface QualifyResult {
  qualified: boolean;
  reason: string;
  top_matches: CapabilityMatch[];
  doctrine_blocked: boolean;
  doctrine_exclusions: string[];
  capability_blocked: boolean;
}
