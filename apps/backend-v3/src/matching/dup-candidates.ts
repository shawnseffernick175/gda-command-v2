/**
 * Near-duplicate opportunity candidate finder (F-440).
 *
 * Pure, deterministic, no DB side-effects — mirrors the style of
 * matcher_v1.ts / scoring.ts.  Surfaces LOW-confidence candidate match
 * pairs for human review.  Does NOT auto-merge anything.
 *
 * LOW — deferred from matcher_v1.ts; candidates only, no link written.
 */

import { token_set_ratio } from 'fuzzball';
import { agencyExact, naicsExact } from './scoring.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DupTier = 'STRONG' | 'WEAK';

export interface DupOpportunity {
  id: number;
  title: string | null;
  agency: string | null;
  naics: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  value_min: number | null;
  value_max: number | null;
}

export interface DupCandidate {
  left_id: number;
  right_id: number;
  confidence: 'LOW';
  tier: DupTier;
  match_method: string;
  signals: {
    solicitation_number_exact?: boolean;
    sam_notice_id_exact?: boolean;
    naics_exact?: boolean;
    agency_exact?: boolean;
    title_similarity?: number;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DUP_TITLE_SIMILARITY_THRESHOLD = 0.80;

// ─── Helpers ────────────────────────────────────────────────────────────────

const PUNCTUATION_WHITESPACE_RE = /^[\s\p{P}\p{S}]+$/u;

/**
 * Returns true when `k` is a usable strong key (non-junk).
 * After trim(), must be non-empty, length ≥ 6, and not purely
 * punctuation/whitespace.  Excludes junk keys like '', '26.BZ'.
 */
export function isUsableKey(k: string | null): boolean {
  if (k == null) return false;
  const trimmed = k.trim();
  if (trimmed.length < 6) return false;
  if (PUNCTUATION_WHITESPACE_RE.test(trimmed)) return false;
  return true;
}

/** Stable pair key for de-duplication (always smaller id first). */
function pairKey(a: number, b: number): string {
  return `${a}:${b}`;
}

// ─── Core algorithm ─────────────────────────────────────────────────────────

/**
 * Find near-duplicate opportunity candidate pairs.
 *
 * Algorithm (deterministic, order-independent, stable output):
 *   1. STRONG pass — shared usable solicitation_number or sam_notice_id.
 *   2. WEAK pass   — fuzzy (naics, agency, title) cluster.
 *   3. Sort STRONG before WEAK, title_similarity desc, (left_id, right_id) asc.
 */
export function findDupCandidates(opps: DupOpportunity[]): DupCandidate[] {
  const seen = new Map<string, DupCandidate>();

  // ── STRONG pass ───────────────────────────────────────────────────────
  strongPass(opps, seen, 'solicitation_number');
  strongPass(opps, seen, 'sam_notice_id');

  // ── WEAK pass ─────────────────────────────────────────────────────────
  weakPass(opps, seen);

  // ── Sort: STRONG before WEAK, title_similarity desc, (left,right) asc ─
  const results = [...seen.values()];
  results.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'STRONG' ? -1 : 1;
    const aSim = a.signals.title_similarity ?? 1;
    const bSim = b.signals.title_similarity ?? 1;
    if (aSim !== bSim) return bSim - aSim;
    if (a.left_id !== b.left_id) return a.left_id - b.left_id;
    return a.right_id - b.right_id;
  });

  return results;
}

// ─── STRONG pass ────────────────────────────────────────────────────────────

function strongPass(
  opps: DupOpportunity[],
  seen: Map<string, DupCandidate>,
  field: 'solicitation_number' | 'sam_notice_id',
): void {
  const groups = new Map<string, DupOpportunity[]>();

  for (const opp of opps) {
    const raw = opp[field];
    if (!isUsableKey(raw)) continue;
    const key = raw!.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(opp);
  }

  const method =
    field === 'solicitation_number'
      ? 'dup_solicitation_number'
      : 'dup_sam_notice_id';

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const leftId = Math.min(a.id, b.id);
        const rightId = Math.max(a.id, b.id);
        const pk = pairKey(leftId, rightId);

        const existing = seen.get(pk);
        if (existing) {
          // Merge signals — prefer solicitation_number method
          if (field === 'solicitation_number') {
            existing.match_method = 'dup_solicitation_number';
            existing.signals.solicitation_number_exact = true;
          } else {
            existing.signals.sam_notice_id_exact = true;
          }
          continue;
        }

        const signals: DupCandidate['signals'] = {
          agency_exact: agencyExact(a.agency, b.agency),
          naics_exact: naicsExact(a.naics, b.naics),
        };

        if (field === 'solicitation_number') {
          signals.solicitation_number_exact = true;
        } else {
          signals.sam_notice_id_exact = true;
        }

        seen.set(pk, {
          left_id: leftId,
          right_id: rightId,
          confidence: 'LOW',
          tier: 'STRONG',
          match_method: method,
          signals,
        });
      }
    }
  }
}

// ─── WEAK pass ──────────────────────────────────────────────────────────────

function weakPass(
  opps: DupOpportunity[],
  seen: Map<string, DupCandidate>,
): void {
  const groups = new Map<string, DupOpportunity[]>();

  for (const opp of opps) {
    if (opp.naics == null || opp.agency == null) continue;
    const key = `${opp.naics.trim()}||${opp.agency.trim().toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(opp);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const leftId = Math.min(a.id, b.id);
        const rightId = Math.max(a.id, b.id);
        const pk = pairKey(leftId, rightId);

        if (seen.has(pk)) continue;
        if (!a.title || !b.title) continue;

        const similarity = token_set_ratio(a.title, b.title) / 100;
        if (similarity < DUP_TITLE_SIMILARITY_THRESHOLD) continue;

        seen.set(pk, {
          left_id: leftId,
          right_id: rightId,
          confidence: 'LOW',
          tier: 'WEAK',
          match_method: 'fuzzy_naics_agency_title',
          signals: {
            naics_exact: true,
            agency_exact: true,
            title_similarity: similarity,
          },
        });
      }
    }
  }
}
