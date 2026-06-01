/**
 * MatcherV1 — cross-source linking engine (F-403).
 *
 * Given a NormalizedOpportunity (from adapter.normalize()), determine
 * whether it matches an existing unified_opportunity or is new.
 *
 * Confidence tiers (v1):
 *   HIGH   — exact notice_id OR (solicitation_number AND agency) exact.
 *            Auto-link, no review required.
 *   MEDIUM — title similarity >= 0.85 (fuzzball token_set_ratio)
 *            AND agency exact
 *            AND (naics exact OR dollar band overlap <= 20%).
 *            Auto-link with confidence=MEDIUM, surface in review queue.
 *   LOW    — deferred to F-440 (candidates only, no link written).
 *
 * Algorithm:
 *   1. Reject duplicates: if (source, source_native_id) already linked.
 *   2. HIGH pass: scan candidates for strong-key match.
 *   3. MEDIUM pass: scan candidates for fuzzy match.
 *   4. No match: caller creates new unified_opportunity + HIGH self-link.
 */

import { defaultScoring } from './scoring.js';
import type {
  MatcherInput,
  CandidateOpportunity,
  MatchResult,
  MatchSignals,
  ScoringFunctions,
} from './types.js';

export const TITLE_SIMILARITY_THRESHOLD = 0.85;
export const DOLLAR_BAND_THRESHOLD = 0.2;

export class MatcherV1 {
  private readonly scoring: ScoringFunctions;

  constructor(scoring?: Partial<ScoringFunctions>) {
    this.scoring = { ...defaultScoring, ...scoring };
  }

  /**
   * Pure matching logic — no DB side-effects.
   *
   * Returns null when (source, source_native_id) is already linked (duplicate).
   */
  findCandidate(
    input: MatcherInput,
    candidates: CandidateOpportunity[],
  ): MatchResult | null {
    // ── 1. Duplicate guard ────────────────────────────────────────────────
    for (const cand of candidates) {
      for (const link of cand.links) {
        if (link.source === input.source && link.source_native_id === input.source_native_id) {
          return null; // already linked — duplicate
        }
      }
    }

    // ── 2. HIGH pass ──────────────────────────────────────────────────────
    const highResult = this.findHigh(input, candidates);
    if (highResult) return highResult;

    // ── 3. MEDIUM pass ────────────────────────────────────────────────────
    const mediumResult = this.findMedium(input, candidates);
    if (mediumResult) return mediumResult;

    // ── 4. No match — new record ──────────────────────────────────────────
    return {
      outcome: 'new',
      confidence: 'HIGH',
      match_method: 'new_internal',
      confirmed_by: 'system',
      internal_id: null,
      signals: {},
    };
  }

  // ─── HIGH tier ──────────────────────────────────────────────────────────

  private findHigh(
    input: MatcherInput,
    candidates: CandidateOpportunity[],
  ): MatchResult | null {
    for (const cand of candidates) {
      // 2a. Exact notice_id: input's source_native_id matches any link's source_native_id
      for (const link of cand.links) {
        if (link.source_native_id === input.source_native_id) {
          return {
            outcome: 'linked',
            confidence: 'HIGH',
            match_method: 'exact_notice_id',
            confirmed_by: 'system',
            internal_id: cand.internal_id,
            signals: { notice_id_exact: true },
          };
        }
      }

      // 2b. Solicitation number + agency exact
      if (input.solicitation_number) {
        const solNorm = input.solicitation_number.trim().toLowerCase();
        const agencyMatch = this.scoring.agencyExact(input.agency, cand.agency);
        if (agencyMatch) {
          for (const storedSol of cand.solicitation_numbers) {
            if (storedSol.trim().toLowerCase() === solNorm) {
              return {
                outcome: 'linked',
                confidence: 'HIGH',
                match_method: 'sol_num_agency_exact',
                confirmed_by: 'system',
                internal_id: cand.internal_id,
                signals: { sol_num_agency_exact: true, agency_exact: true },
              };
            }
          }
        }
      }
    }

    return null;
  }

  // ─── MEDIUM tier ────────────────────────────────────────────────────────

  private findMedium(
    input: MatcherInput,
    candidates: CandidateOpportunity[],
  ): MatchResult | null {
    let bestScore = 0;
    let bestCandidate: CandidateOpportunity | null = null;
    let bestSignals: MatchSignals = {};

    for (const cand of candidates) {
      if (!cand.title) continue;

      const titleScore = this.scoring.titleSimilarity(input.title, cand.title);
      if (titleScore < TITLE_SIMILARITY_THRESHOLD) continue;

      const agencyMatch = this.scoring.agencyExact(input.agency, cand.agency);
      if (!agencyMatch) continue;

      const naicsMatch = this.scoring.naicsExact(input.naics, cand.naics);
      const dollarMatch = this.scoring.dollarBandOverlap(
        input.estimated_value_cents,
        cand.estimated_value_cents,
        DOLLAR_BAND_THRESHOLD,
      );

      if (!naicsMatch && !dollarMatch) continue;

      if (titleScore > bestScore) {
        bestScore = titleScore;
        bestCandidate = cand;
        bestSignals = {
          title_similarity: titleScore,
          agency_exact: true,
          naics_exact: naicsMatch,
          dollar_band_overlap: dollarMatch,
        };
      }
    }

    if (bestCandidate) {
      return {
        outcome: 'linked',
        confidence: 'MEDIUM',
        match_method: 'fuzzy_title_agency',
        confirmed_by: null,
        internal_id: bestCandidate.internal_id,
        signals: bestSignals,
      };
    }

    return null;
  }
}
