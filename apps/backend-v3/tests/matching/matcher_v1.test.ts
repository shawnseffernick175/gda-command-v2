/**
 * Unit tests for MatcherV1 (F-403).
 *
 * Covers:
 *   - HIGH confidence (10+ cases):  exact notice_id, sol_num + agency
 *   - MEDIUM confidence (10+ cases): fuzzy title + agency + naics/dollar
 *   - Negative cases (10+):          no match → new_internal
 *   - Holdout precision metric:      >= 0.95 HIGH, >= 0.85 MEDIUM
 *   - Duplicate rejection
 *   - Edge cases
 */

import { describe, it, expect } from 'vitest';
import { MatcherV1, TITLE_SIMILARITY_THRESHOLD, DOLLAR_BAND_THRESHOLD } from '../../src/matching/matcher_v1.js';
import { titleSimilarity, agencyExact, naicsExact, dollarBandOverlap } from '../../src/matching/scoring.js';
import type { MatcherInput, CandidateOpportunity } from '../../src/matching/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<MatcherInput> = {}): MatcherInput {
  return {
    source: 'sam',
    source_native_id: 'new-notice-001',
    lifecycle_stage: 'solicitation',
    title: 'IT Support Services for Army Sustainment Command',
    agency: 'DEPT OF THE ARMY',
    naics: '541512',
    estimated_value_cents: 500_000_00,
    solicitation_number: 'W912DY-26-R-0001',
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateOpportunity> & { internal_id: string }): CandidateOpportunity {
  return {
    title: 'IT Support Services for Army Sustainment Command',
    agency: 'DEPT OF THE ARMY',
    naics: '541512',
    estimated_value_cents: 500_000_00,
    solicitation_numbers: ['W912DY-26-R-0001'],
    links: [{ source: 'grants_gov', source_native_id: 'gt-existing-001' }],
    ...overrides,
  };
}

const matcher = new MatcherV1();

// ═════════════════════════════════════════════════════════════════════════════
// Scoring function unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe('scoring functions', () => {
  describe('titleSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(titleSimilarity('Army IT Services', 'Army IT Services')).toBe(1);
    });

    it('returns high score for token-reordered strings', () => {
      const score = titleSimilarity(
        'IT Support Services for Army Sustainment',
        'Army Sustainment IT Support Services',
      );
      expect(score).toBeGreaterThanOrEqual(0.85);
    });

    it('returns low score for unrelated strings', () => {
      const score = titleSimilarity(
        'IT Support Services for Army',
        'Marine Biology Research Grant',
      );
      expect(score).toBeLessThan(0.5);
    });

    it('returns 0 for empty strings', () => {
      expect(titleSimilarity('', 'something')).toBe(0);
      expect(titleSimilarity('something', '')).toBe(0);
    });
  });

  describe('agencyExact', () => {
    it('matches case-insensitively', () => {
      expect(agencyExact('Dept of the Army', 'DEPT OF THE ARMY')).toBe(true);
    });

    it('trims whitespace', () => {
      expect(agencyExact('  ARMY  ', 'ARMY')).toBe(true);
    });

    it('rejects nulls', () => {
      expect(agencyExact(null, 'ARMY')).toBe(false);
      expect(agencyExact('ARMY', null)).toBe(false);
    });

    it('rejects different agencies', () => {
      expect(agencyExact('DEPT OF THE ARMY', 'DEPT OF THE NAVY')).toBe(false);
    });
  });

  describe('naicsExact', () => {
    it('matches identical codes', () => {
      expect(naicsExact('541512', '541512')).toBe(true);
    });

    it('rejects different codes', () => {
      expect(naicsExact('541512', '541330')).toBe(false);
    });

    it('rejects nulls', () => {
      expect(naicsExact(null, '541512')).toBe(false);
    });
  });

  describe('dollarBandOverlap', () => {
    it('matches values within 20% band', () => {
      expect(dollarBandOverlap(100_000, 115_000, 0.2)).toBe(true);
    });

    it('rejects values outside 20% band', () => {
      expect(dollarBandOverlap(100_000, 150_000, 0.2)).toBe(false);
    });

    it('matches identical values', () => {
      expect(dollarBandOverlap(500_000, 500_000, 0.2)).toBe(true);
    });

    it('matches both-zero', () => {
      expect(dollarBandOverlap(0, 0, 0.2)).toBe(true);
    });

    it('rejects nulls', () => {
      expect(dollarBandOverlap(null, 100_000, 0.2)).toBe(false);
      expect(dollarBandOverlap(100_000, null, 0.2)).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HIGH confidence tests (10+)
// ═════════════════════════════════════════════════════════════════════════════

describe('MatcherV1 — HIGH confidence', () => {
  it('H1: matches on exact source_native_id across sources', () => {
    const input = makeInput({ source: 'grants_gov', source_native_id: 'shared-id-001' });
    const cand = makeCandidate({
      internal_id: 'uuid-1',
      links: [{ source: 'sam', source_native_id: 'shared-id-001' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('HIGH');
    expect(result!.match_method).toBe('exact_notice_id');
    expect(result!.confirmed_by).toBe('system');
    expect(result!.internal_id).toBe('uuid-1');
  });

  it('H2: matches on solicitation_number + agency exact', () => {
    const input = makeInput({ source: 'grants_gov', source_native_id: 'gt-999' });
    const cand = makeCandidate({
      internal_id: 'uuid-2',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-abc' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('HIGH');
    expect(result!.match_method).toBe('sol_num_agency_exact');
    expect(result!.confirmed_by).toBe('system');
  });

  it('H3: sol_num match is case-insensitive + trimmed', () => {
    const input = makeInput({
      source: 'govwin',
      source_native_id: 'gw-100',
      solicitation_number: '  w912dy-26-r-0001  ',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-3',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-xyz' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('HIGH');
  });

  it('H4: notice_id match takes precedence over MEDIUM', () => {
    const input = makeInput({ source: 'grants_gov', source_native_id: 'shared-id-002' });
    const candHigh = makeCandidate({
      internal_id: 'uuid-high',
      title: 'Completely different title',
      links: [{ source: 'sam', source_native_id: 'shared-id-002' }],
    });
    const candMedium = makeCandidate({
      internal_id: 'uuid-medium',
      links: [{ source: 'sam', source_native_id: 'other' }],
    });
    const result = matcher.findCandidate(input, [candHigh, candMedium]);
    expect(result!.confidence).toBe('HIGH');
    expect(result!.internal_id).toBe('uuid-high');
  });

  it('H5: sol_num match with different source keys', () => {
    const input = makeInput({ source: 'govwin', source_native_id: 'gw-200' });
    const cand = makeCandidate({
      internal_id: 'uuid-5',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-200' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('HIGH');
    expect(result!.match_method).toBe('sol_num_agency_exact');
  });

  it('H6: notice_id match across three sources', () => {
    const input = makeInput({ source: 'govwin', source_native_id: 'common-id' });
    const cand = makeCandidate({
      internal_id: 'uuid-6',
      links: [
        { source: 'sam', source_native_id: 'sam-orig' },
        { source: 'grants_gov', source_native_id: 'common-id' },
      ],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('HIGH');
    expect(result!.match_method).toBe('exact_notice_id');
  });

  it('H7: multiple candidates — picks first HIGH on notice_id', () => {
    const input = makeInput({ source: 'grants_gov', source_native_id: 'match-me' });
    const cand1 = makeCandidate({
      internal_id: 'uuid-7a',
      links: [{ source: 'sam', source_native_id: 'match-me' }],
    });
    const cand2 = makeCandidate({
      internal_id: 'uuid-7b',
      links: [{ source: 'sam', source_native_id: 'match-me' }],
    });
    const result = matcher.findCandidate(input, [cand1, cand2]);
    expect(result!.confidence).toBe('HIGH');
    expect(result!.internal_id).toBe('uuid-7a');
  });

  it('H8: sol_num match ignores candidate with wrong agency', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-800',
      agency: 'DEPT OF THE ARMY',
    });
    const wrongAgency = makeCandidate({
      internal_id: 'uuid-wrong',
      agency: 'DEPT OF THE NAVY',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-800' }],
    });
    const rightAgency = makeCandidate({
      internal_id: 'uuid-right',
      agency: 'DEPT OF THE ARMY',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-801' }],
    });
    const result = matcher.findCandidate(input, [wrongAgency, rightAgency]);
    expect(result!.internal_id).toBe('uuid-right');
  });

  it('H9: candidate with multiple stored solicitation numbers', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-900',
      solicitation_number: 'FA8750-26-R-0010',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-9',
      solicitation_numbers: ['W912DY-26-R-0001', 'FA8750-26-R-0010'],
      links: [{ source: 'sam', source_native_id: 'sam-900' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('HIGH');
  });

  it('H10: sol_num match with uppercase/lowercase mismatch', () => {
    const input = makeInput({
      source: 'govwin',
      source_native_id: 'gw-1000',
      solicitation_number: 'hq0034-26-r-0005',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-10',
      solicitation_numbers: ['HQ0034-26-R-0005'],
      links: [{ source: 'sam', source_native_id: 'sam-1000' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('HIGH');
    expect(result!.match_method).toBe('sol_num_agency_exact');
  });

  it('H11: signals object contains correct flags', () => {
    const input = makeInput({ source: 'grants_gov', source_native_id: 'notice-match' });
    const cand = makeCandidate({
      internal_id: 'uuid-11',
      links: [{ source: 'sam', source_native_id: 'notice-match' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.signals.notice_id_exact).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MEDIUM confidence tests (10+)
// ═════════════════════════════════════════════════════════════════════════════

describe('MatcherV1 — MEDIUM confidence', () => {
  it('M1: fuzzy title + exact agency + exact naics', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m1',
      solicitation_number: null,
      title: 'IT Support Services — Army Sustainment Command',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m1',
      title: 'IT Support Services for Army Sustainment Command',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m1' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('MEDIUM');
    expect(result!.match_method).toBe('fuzzy_title_agency');
    expect(result!.confirmed_by).toBeNull();
  });

  it('M2: fuzzy title + exact agency + dollar band overlap (no naics)', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m2',
      solicitation_number: null,
      naics: null,
      estimated_value_cents: 550_000_00,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m2',
      naics: null,
      estimated_value_cents: 500_000_00,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m2' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
    expect(result!.signals.dollar_band_overlap).toBe(true);
  });

  it('M3: title with extra words still passes threshold', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m3',
      solicitation_number: null,
      title: 'IT Support Services for Army Sustainment Command — Amendment 3',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m3',
      title: 'IT Support Services for Army Sustainment Command',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m3' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
  });

  it('M4: title with reordered tokens passes threshold', () => {
    const input = makeInput({
      source: 'govwin',
      source_native_id: 'gw-m4',
      solicitation_number: null,
      title: 'Army Sustainment Command IT Support Services',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m4',
      title: 'IT Support Services for Army Sustainment Command',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m4' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
  });

  it('M5: picks highest title score among multiple MEDIUM candidates', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m5',
      solicitation_number: null,
      title: 'IT Support Services for Army Sustainment Command',
    });
    const candA = makeCandidate({
      internal_id: 'uuid-m5a',
      title: 'IT Support — Army Sustainment Logistics and Readiness',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m5a' }],
    });
    const candB = makeCandidate({
      internal_id: 'uuid-m5b',
      title: 'IT Support Services for Army Sustainment Command Operations',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m5b' }],
    });
    const result = matcher.findCandidate(input, [candA, candB]);
    expect(result!.confidence).toBe('MEDIUM');
    expect(result!.internal_id).toBe('uuid-m5b');
  });

  it('M6: medium with naics match but no dollar value', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m6',
      solicitation_number: null,
      estimated_value_cents: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m6',
      estimated_value_cents: null,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m6' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
    expect(result!.signals.naics_exact).toBe(true);
  });

  it('M7: both naics AND dollar match — still MEDIUM', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m7',
      solicitation_number: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m7',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m7' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
    expect(result!.signals.naics_exact).toBe(true);
    expect(result!.signals.dollar_band_overlap).toBe(true);
  });

  it('M8: signals include title_similarity numeric value', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m8',
      solicitation_number: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m8',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m8' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.signals.title_similarity).toBeGreaterThanOrEqual(TITLE_SIMILARITY_THRESHOLD);
  });

  it('M9: dollar band at exactly 20% boundary matches', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m9',
      solicitation_number: null,
      naics: null,
      estimated_value_cents: 600_000_00,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m9',
      naics: null,
      estimated_value_cents: 500_000_00,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m9' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
  });

  it('M10: confirmed_by is null for MEDIUM matches', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-m10',
      solicitation_number: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m10',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m10' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confirmed_by).toBeNull();
  });

  it('M11: case-insensitive agency still triggers MEDIUM', () => {
    const input = makeInput({
      source: 'govwin',
      source_native_id: 'gw-m11',
      solicitation_number: null,
      agency: 'dept of the army',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-m11',
      agency: 'DEPT OF THE ARMY',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-m11' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Negative cases (10+) — no match → new_internal
// ═════════════════════════════════════════════════════════════════════════════

describe('MatcherV1 — Negative / new_internal', () => {
  it('N1: completely different title + different agency', () => {
    const input = makeInput({
      source: 'sam',
      source_native_id: 'sam-n1',
      title: 'Marine Biology Research Grant',
      agency: 'NATIONAL SCIENCE FOUNDATION',
      naics: '541711',
      solicitation_number: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n1',
      solicitation_numbers: [],
      links: [{ source: 'grants_gov', source_native_id: 'gt-n1' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
    expect(result!.confidence).toBe('HIGH');
    expect(result!.match_method).toBe('new_internal');
    expect(result!.internal_id).toBeNull();
  });

  it('N2: similar title but different agency fails MEDIUM', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n2',
      solicitation_number: null,
      agency: 'DEPT OF THE NAVY',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n2',
      agency: 'DEPT OF THE ARMY',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-n2' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N3: same agency but title below threshold', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n3',
      solicitation_number: null,
      title: 'Cybersecurity Assessment Services',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n3',
      title: 'IT Support Services for Army Sustainment Command',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-n3' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N4: title + agency match but neither naics nor dollar overlap', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n4',
      solicitation_number: null,
      naics: '336411',
      estimated_value_cents: 100_000_000_00,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n4',
      naics: '541512',
      estimated_value_cents: 500_000_00,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-n4' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N5: empty candidates list → new', () => {
    const input = makeInput({ source: 'sam', source_native_id: 'first-ever' });
    const result = matcher.findCandidate(input, []);
    expect(result!.outcome).toBe('new');
    expect(result!.match_method).toBe('new_internal');
  });

  it('N6: sol_num matches but agency differs → no HIGH, falls through to new', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n6',
      agency: 'DEPT OF THE NAVY',
      title: 'Submarine Maintenance Services',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n6',
      agency: 'DEPT OF THE ARMY',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-n6' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N7: null agency on both sides → no MEDIUM match', () => {
    const input = makeInput({
      source: 'sam',
      source_native_id: 'sam-n7',
      solicitation_number: null,
      agency: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n7',
      agency: null,
      solicitation_numbers: [],
      links: [{ source: 'grants_gov', source_native_id: 'gt-n7' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N8: candidate with null title → no MEDIUM match', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n8',
      solicitation_number: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n8',
      title: null,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-n8' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N9: dollar band just outside 20% → no MEDIUM (with naics null)', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n9',
      solicitation_number: null,
      naics: null,
      estimated_value_cents: 650_000_00,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n9',
      naics: null,
      estimated_value_cents: 500_000_00,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-n9' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N10: no solicitation_number on input → no HIGH sol match path', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n10',
      solicitation_number: null,
      title: 'Completely Novel Procurement Opportunity XYZ',
      agency: 'GENERAL SERVICES ADMINISTRATION',
      naics: '238220',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n10',
      title: 'IT Support Services for Army Sustainment Command',
      agency: 'DEPT OF THE ARMY',
      solicitation_numbers: ['W912DY-26-R-0001'],
      links: [{ source: 'sam', source_native_id: 'sam-n10' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });

  it('N11: title match but naics differ and dollar null → no MEDIUM', () => {
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-n11',
      solicitation_number: null,
      naics: '336411',
      estimated_value_cents: null,
    });
    const cand = makeCandidate({
      internal_id: 'uuid-n11',
      naics: '541512',
      estimated_value_cents: null,
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-n11' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result!.outcome).toBe('new');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Duplicate rejection
// ═════════════════════════════════════════════════════════════════════════════

describe('MatcherV1 — Duplicate rejection', () => {
  it('D1: returns null when (source, source_native_id) already linked', () => {
    const input = makeInput({ source: 'sam', source_native_id: 'already-linked' });
    const cand = makeCandidate({
      internal_id: 'uuid-d1',
      links: [{ source: 'sam', source_native_id: 'already-linked' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result).toBeNull();
  });

  it('D2: same source_native_id different source is NOT a duplicate', () => {
    const input = makeInput({ source: 'grants_gov', source_native_id: 'id-123' });
    const cand = makeCandidate({
      internal_id: 'uuid-d2',
      links: [{ source: 'sam', source_native_id: 'id-123' }],
    });
    const result = matcher.findCandidate(input, [cand]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('HIGH');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Custom scoring injection
// ═════════════════════════════════════════════════════════════════════════════

describe('MatcherV1 — Custom scoring', () => {
  it('accepts injected scoring functions', () => {
    const alwaysMatch = new MatcherV1({
      titleSimilarity: () => 1.0,
      agencyExact: () => true,
      naicsExact: () => true,
    });
    const input = makeInput({
      source: 'grants_gov',
      source_native_id: 'gt-custom',
      solicitation_number: null,
      title: 'ZZZZZ',
      agency: 'FAKE',
    });
    const cand = makeCandidate({
      internal_id: 'uuid-custom',
      title: 'YYYYY',
      agency: 'OTHER',
      solicitation_numbers: [],
      links: [{ source: 'sam', source_native_id: 'sam-custom' }],
    });
    const result = alwaysMatch.findCandidate(input, [cand]);
    expect(result!.confidence).toBe('MEDIUM');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Holdout precision metric (labeled test data)
// ═════════════════════════════════════════════════════════════════════════════

describe('MatcherV1 — Holdout precision', () => {
  interface LabeledCase {
    input: MatcherInput;
    candidates: CandidateOpportunity[];
    expected: 'HIGH' | 'MEDIUM' | 'new';
  }

  const holdout: LabeledCase[] = [
    // ── HIGH expected ──
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-h-a', solicitation_number: 'W912DY-26-R-0001' }),
      candidates: [makeCandidate({ internal_id: 'u-ha', solicitation_numbers: ['W912DY-26-R-0001'], links: [{ source: 'sam', source_native_id: 'sam-ha' }] })],
      expected: 'HIGH',
    },
    {
      input: makeInput({ source: 'govwin', source_native_id: 'notice-x' }),
      candidates: [makeCandidate({ internal_id: 'u-hb', links: [{ source: 'sam', source_native_id: 'notice-x' }] })],
      expected: 'HIGH',
    },
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-h-c', solicitation_number: 'FA8750-26-R-0010' }),
      candidates: [makeCandidate({ internal_id: 'u-hc', solicitation_numbers: ['FA8750-26-R-0010'], links: [{ source: 'sam', source_native_id: 'sam-hc' }] })],
      expected: 'HIGH',
    },
    {
      input: makeInput({ source: 'govwin', source_native_id: 'gw-h-d', solicitation_number: 'HQ0034-26-R-0005' }),
      candidates: [makeCandidate({ internal_id: 'u-hd', solicitation_numbers: ['HQ0034-26-R-0005'], links: [{ source: 'sam', source_native_id: 'sam-hd' }] })],
      expected: 'HIGH',
    },
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-h-e', solicitation_number: 'N00024-26-R-0100' }),
      candidates: [makeCandidate({ internal_id: 'u-he', agency: 'DEPT OF THE ARMY', solicitation_numbers: ['N00024-26-R-0100'], links: [{ source: 'sam', source_native_id: 'sam-he' }] })],
      expected: 'HIGH',
    },
    // ── MEDIUM expected ──
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-m-a', solicitation_number: null, title: 'IT Support Services — Army Sustainment Command' }),
      candidates: [makeCandidate({ internal_id: 'u-ma', solicitation_numbers: [], links: [{ source: 'sam', source_native_id: 'sam-ma' }] })],
      expected: 'MEDIUM',
    },
    {
      input: makeInput({ source: 'govwin', source_native_id: 'gw-m-b', solicitation_number: null, title: 'Army Sustainment Command IT Support' }),
      candidates: [makeCandidate({ internal_id: 'u-mb', solicitation_numbers: [], links: [{ source: 'sam', source_native_id: 'sam-mb' }] })],
      expected: 'MEDIUM',
    },
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-m-c', solicitation_number: null, naics: null, estimated_value_cents: 550_000_00 }),
      candidates: [makeCandidate({ internal_id: 'u-mc', naics: null, estimated_value_cents: 500_000_00, solicitation_numbers: [], links: [{ source: 'sam', source_native_id: 'sam-mc' }] })],
      expected: 'MEDIUM',
    },
    {
      input: makeInput({ source: 'govwin', source_native_id: 'gw-m-d', solicitation_number: null, title: 'IT Support Services for the Army Sustainment Command Base Operations' }),
      candidates: [makeCandidate({ internal_id: 'u-md', solicitation_numbers: [], links: [{ source: 'sam', source_native_id: 'sam-md' }] })],
      expected: 'MEDIUM',
    },
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-m-e', solicitation_number: null }),
      candidates: [makeCandidate({ internal_id: 'u-me', solicitation_numbers: [], links: [{ source: 'sam', source_native_id: 'sam-me' }] })],
      expected: 'MEDIUM',
    },
    // ── NEW expected ──
    {
      input: makeInput({ source: 'sam', source_native_id: 'sam-new-a', solicitation_number: null, title: 'Marine Biology Research Grant', agency: 'NSF', naics: '541711' }),
      candidates: [makeCandidate({ internal_id: 'u-na', solicitation_numbers: [], links: [{ source: 'grants_gov', source_native_id: 'gt-na' }] })],
      expected: 'new',
    },
    {
      input: makeInput({ source: 'sam', source_native_id: 'sam-new-b', solicitation_number: null, title: 'Cybersecurity Assessment', agency: 'DHS', naics: '541519' }),
      candidates: [makeCandidate({ internal_id: 'u-nb', solicitation_numbers: [], links: [{ source: 'grants_gov', source_native_id: 'gt-nb' }] })],
      expected: 'new',
    },
    {
      input: makeInput({ source: 'grants_gov', source_native_id: 'gt-new-c' }),
      candidates: [],
      expected: 'new',
    },
    {
      input: makeInput({ source: 'govwin', source_native_id: 'gw-new-d', solicitation_number: null, agency: 'DEPT OF THE NAVY', title: 'Submarine Hull Repair Services' }),
      candidates: [makeCandidate({ internal_id: 'u-nd', solicitation_numbers: [], links: [{ source: 'sam', source_native_id: 'sam-nd' }] })],
      expected: 'new',
    },
    {
      input: makeInput({ source: 'sam', source_native_id: 'sam-new-e', solicitation_number: null, title: 'Cloud Migration Services', agency: 'VA', naics: '541519', estimated_value_cents: 100_000_000_00 }),
      candidates: [makeCandidate({ internal_id: 'u-ne', naics: '541512', estimated_value_cents: 500_000_00, solicitation_numbers: [], links: [{ source: 'grants_gov', source_native_id: 'gt-ne' }] })],
      expected: 'new',
    },
  ];

  it('meets precision targets: >= 0.95 HIGH, >= 0.85 MEDIUM', () => {
    let highCorrect = 0;
    let highTotal = 0;
    let mediumCorrect = 0;
    let mediumTotal = 0;

    for (const tc of holdout) {
      const result = matcher.findCandidate(tc.input, tc.candidates);

      if (tc.expected === 'HIGH') {
        highTotal++;
        if (result && result.confidence === 'HIGH' && result.outcome === 'linked') highCorrect++;
      } else if (tc.expected === 'MEDIUM') {
        mediumTotal++;
        if (result && result.confidence === 'MEDIUM') mediumCorrect++;
      } else {
        // 'new' expected — count as HIGH (new_internal is HIGH confidence)
        highTotal++;
        if (result && result.outcome === 'new') highCorrect++;
      }
    }

    const highPrecision = highTotal > 0 ? highCorrect / highTotal : 1;
    const mediumPrecision = mediumTotal > 0 ? mediumCorrect / mediumTotal : 1;

    expect(highPrecision).toBeGreaterThanOrEqual(0.95);
    expect(mediumPrecision).toBeGreaterThanOrEqual(0.85);
  });
});
