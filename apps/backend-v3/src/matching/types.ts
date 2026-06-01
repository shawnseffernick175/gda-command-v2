/**
 * Types for the MatcherV1 cross-source linking engine (F-403).
 *
 * MatcherInput  — the record to match (adapter normalize() output + source key).
 * CandidateOpportunity — an existing unified opportunity with its links.
 * MatchResult   — the matcher's decision.
 */

import type { LinkConfidence, LifecycleStage } from '../db/types/opportunity.js';

// ─── Input ──────────────────────────────────────────────────────────────────

export interface MatcherInput {
  source: string;
  source_native_id: string;
  lifecycle_stage: LifecycleStage;
  title: string;
  agency: string | null;
  naics: string | null;
  estimated_value_cents: number | null;
  /** Solicitation number, if available from the raw record. */
  solicitation_number?: string | null;
}

// ─── Candidates ─────────────────────────────────────────────────────────────

export interface CandidateLink {
  source: string;
  source_native_id: string;
}

export interface CandidateOpportunity {
  internal_id: string;
  title: string | null;
  agency: string | null;
  naics: string | null;
  estimated_value_cents: number | null;
  /** Solicitation numbers collected from field overrides / prior links. */
  solicitation_numbers: string[];
  links: CandidateLink[];
}

// ─── Result ─────────────────────────────────────────────────────────────────

export type MatchOutcome = 'linked' | 'new';

export interface MatchSignals {
  notice_id_exact?: boolean;
  sol_num_agency_exact?: boolean;
  title_similarity?: number;
  agency_exact?: boolean;
  naics_exact?: boolean;
  dollar_band_overlap?: boolean;
  [key: string]: unknown;
}

export interface MatchResult {
  outcome: MatchOutcome;
  confidence: LinkConfidence;
  match_method: string;
  confirmed_by: string | null;
  internal_id: string | null;
  signals: MatchSignals;
}

// ─── Scoring function signatures (pluggable) ────────────────────────────────

export type TitleScorer = (a: string, b: string) => number;
export type ExactMatcher = (a: string | null, b: string | null) => boolean;
export type DollarBandChecker = (a: number | null, b: number | null, threshold: number) => boolean;

export interface ScoringFunctions {
  titleSimilarity: TitleScorer;
  agencyExact: ExactMatcher;
  naicsExact: ExactMatcher;
  dollarBandOverlap: DollarBandChecker;
}
