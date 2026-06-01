/**
 * Pluggable scoring functions for MatcherV1 (F-403).
 *
 * Each function is a pure, stateless comparator.
 * Swap implementations by passing a custom ScoringFunctions object.
 */

import { token_set_ratio } from 'fuzzball';
import type { TitleScorer, ExactMatcher, DollarBandChecker, ScoringFunctions } from './types.js';

// ─── Title similarity (fuzzball token_set_ratio) ────────────────────────────

const titleSimilarity: TitleScorer = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const score = token_set_ratio(a, b);
  return score / 100;
};

// ─── Agency exact (case-insensitive, trimmed) ───────────────────────────────

const agencyExact: ExactMatcher = (a: string | null, b: string | null): boolean => {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
};

// ─── NAICS exact ────────────────────────────────────────────────────────────

const naicsExact: ExactMatcher = (a: string | null, b: string | null): boolean => {
  if (a == null || b == null) return false;
  return a.trim() === b.trim();
};

// ─── Dollar band overlap ────────────────────────────────────────────────────

const dollarBandOverlap: DollarBandChecker = (
  a: number | null,
  b: number | null,
  threshold = 0.2,
): boolean => {
  if (a == null || b == null) return false;
  if (a === 0 && b === 0) return true;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return true;
  const diff = Math.abs(a - b) / max;
  return diff <= threshold;
};

// ─── Default bundle ─────────────────────────────────────────────────────────

export const defaultScoring: ScoringFunctions = {
  titleSimilarity,
  agencyExact,
  naicsExact,
  dollarBandOverlap,
};

export { titleSimilarity, agencyExact, naicsExact, dollarBandOverlap };
