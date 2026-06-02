/**
 * Unit tests for dup-candidates (F-440).
 *
 * Covers:
 *   - isUsableKey helper (junk rejection, valid acceptance)
 *   - STRONG pass (shared solicitation_number / sam_notice_id)
 *   - STRONG de-dupe (pair found by both keys → one candidate)
 *   - Junk guard (short / punctuation keys → zero STRONG)
 *   - WEAK pass (fuzzy naics+agency+title)
 *   - STRONG-over-WEAK precedence
 *   - Determinism (shuffled input → identical output)
 */

import { describe, it, expect } from 'vitest';
import {
  isUsableKey,
  findDupCandidates,
  DUP_TITLE_SIMILARITY_THRESHOLD,
  type DupOpportunity,
} from '../../src/matching/dup-candidates.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let nextId = 1;

function makeOpp(overrides: Partial<DupOpportunity> = {}): DupOpportunity {
  return {
    id: nextId++,
    title: 'Generic Opportunity Title',
    agency: 'DEPT OF THE ARMY',
    naics: '541512',
    solicitation_number: null,
    sam_notice_id: null,
    value_min: null,
    value_max: null,
    ...overrides,
  };
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ═════════════════════════════════════════════════════════════════════════════
// isUsableKey
// ═════════════════════════════════════════════════════════════════════════════

describe('isUsableKey', () => {
  it('rejects null', () => {
    expect(isUsableKey(null)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isUsableKey('')).toBe(false);
  });

  it('rejects whitespace-only', () => {
    expect(isUsableKey('   ')).toBe(false);
  });

  it('rejects short junk key "26.BZ"', () => {
    expect(isUsableKey('26.BZ')).toBe(false);
  });

  it('rejects short junk key "26.TZ"', () => {
    expect(isUsableKey('26.TZ')).toBe(false);
  });

  it('accepts a real solicitation number N6600126R0019', () => {
    expect(isUsableKey('N6600126R0019')).toBe(true);
  });

  it('accepts a real solicitation number 36C24225Q1071', () => {
    expect(isUsableKey('36C24225Q1071')).toBe(true);
  });

  it('accepts a 6-char alphanumeric key', () => {
    expect(isUsableKey('ABC123')).toBe(true);
  });

  it('rejects a 5-char key (too short)', () => {
    expect(isUsableKey('AB123')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRONG pass
// ═════════════════════════════════════════════════════════════════════════════

describe('findDupCandidates — STRONG pass', () => {
  it('emits one candidate for two opps sharing a usable solicitation_number', () => {
    const a = makeOpp({ id: 10, solicitation_number: 'N6600126R0019' });
    const b = makeOpp({ id: 20, solicitation_number: 'N6600126R0019' });
    const results = findDupCandidates([a, b]);

    expect(results).toHaveLength(1);
    const c = results[0]!;
    expect(c.left_id).toBe(10);
    expect(c.right_id).toBe(20);
    expect(c.confidence).toBe('LOW');
    expect(c.tier).toBe('STRONG');
    expect(c.match_method).toBe('dup_solicitation_number');
    expect(c.signals.solicitation_number_exact).toBe(true);
  });

  it('emits one candidate for two opps sharing a usable sam_notice_id', () => {
    const a = makeOpp({ id: 30, sam_notice_id: 'NOTICE-ABC-123456' });
    const b = makeOpp({ id: 40, sam_notice_id: 'NOTICE-ABC-123456' });
    const results = findDupCandidates([a, b]);

    expect(results).toHaveLength(1);
    const c = results[0]!;
    expect(c.match_method).toBe('dup_sam_notice_id');
    expect(c.signals.sam_notice_id_exact).toBe(true);
  });

  it('de-dupes pair sharing BOTH solicitation_number and sam_notice_id', () => {
    const a = makeOpp({
      id: 50,
      solicitation_number: 'N6600126R0019',
      sam_notice_id: 'NOTICE-XYZ-654321',
    });
    const b = makeOpp({
      id: 60,
      solicitation_number: 'N6600126R0019',
      sam_notice_id: 'NOTICE-XYZ-654321',
    });
    const results = findDupCandidates([a, b]);

    expect(results).toHaveLength(1);
    const c = results[0]!;
    // Prefers solicitation_number method
    expect(c.match_method).toBe('dup_solicitation_number');
    expect(c.signals.solicitation_number_exact).toBe(true);
    expect(c.signals.sam_notice_id_exact).toBe(true);
  });

  it('ensures left_id < right_id regardless of input order', () => {
    const a = makeOpp({ id: 99, solicitation_number: 'ABCDEF123456' });
    const b = makeOpp({ id: 5, solicitation_number: 'ABCDEF123456' });
    const results = findDupCandidates([a, b]);

    expect(results).toHaveLength(1);
    expect(results[0]!.left_id).toBe(5);
    expect(results[0]!.right_id).toBe(99);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Junk guard
// ═════════════════════════════════════════════════════════════════════════════

describe('findDupCandidates — junk guard', () => {
  it('3 opps sharing solicitation_number "26.BZ" → ZERO STRONG candidates', () => {
    const opps = [
      makeOpp({ id: 100, solicitation_number: '26.BZ', title: 'Alpha contract' }),
      makeOpp({ id: 101, solicitation_number: '26.BZ', title: 'Beta services' }),
      makeOpp({ id: 102, solicitation_number: '26.BZ', title: 'Gamma consulting' }),
    ];
    const results = findDupCandidates(opps);
    const strong = results.filter((c) => c.tier === 'STRONG');
    expect(strong).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WEAK pass
// ═════════════════════════════════════════════════════════════════════════════

describe('findDupCandidates — WEAK pass', () => {
  it('emits WEAK candidate for near-identical titles in same (naics, agency)', () => {
    const a = makeOpp({
      id: 200,
      naics: '541330',
      agency: 'DEPT OF THE NAVY',
      title: 'IT Support Services for Naval Air Systems Command',
    });
    const b = makeOpp({
      id: 201,
      naics: '541330',
      agency: 'DEPT OF THE NAVY',
      title: 'IT Support Services for Naval Air Systems Command - Amendment 1',
    });
    const results = findDupCandidates([a, b]);
    const weak = results.filter((c) => c.tier === 'WEAK');

    expect(weak).toHaveLength(1);
    expect(weak[0]!.match_method).toBe('fuzzy_naics_agency_title');
    expect(weak[0]!.signals.title_similarity).toBeGreaterThanOrEqual(DUP_TITLE_SIMILARITY_THRESHOLD);
    expect(weak[0]!.signals.naics_exact).toBe(true);
    expect(weak[0]!.signals.agency_exact).toBe(true);
  });

  it('does NOT emit WEAK candidate for dissimilar titles in same (naics, agency)', () => {
    const a = makeOpp({
      id: 300,
      naics: '541330',
      agency: 'DEPT OF THE NAVY',
      title: 'IT Support Services for Naval Air Systems Command',
    });
    const b = makeOpp({
      id: 301,
      naics: '541330',
      agency: 'DEPT OF THE NAVY',
      title: 'Marine Biology Research and Environmental Assessment',
    });
    const results = findDupCandidates([a, b]);
    const weak = results.filter((c) => c.tier === 'WEAK');
    expect(weak).toHaveLength(0);
  });

  it('skips WEAK when naics is null', () => {
    const a = makeOpp({
      id: 400,
      naics: null,
      agency: 'DEPT OF THE ARMY',
      title: 'IT Support',
    });
    const b = makeOpp({
      id: 401,
      naics: null,
      agency: 'DEPT OF THE ARMY',
      title: 'IT Support',
    });
    const results = findDupCandidates([a, b]);
    expect(results).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRONG-over-WEAK precedence
// ═════════════════════════════════════════════════════════════════════════════

describe('findDupCandidates — STRONG-over-WEAK precedence', () => {
  it('pair qualifying for both STRONG and WEAK appears once as STRONG', () => {
    const a = makeOpp({
      id: 500,
      solicitation_number: 'N6600126R0019',
      naics: '541512',
      agency: 'DEPT OF THE ARMY',
      title: 'IT Support Services for Army Sustainment Command',
    });
    const b = makeOpp({
      id: 501,
      solicitation_number: 'N6600126R0019',
      naics: '541512',
      agency: 'DEPT OF THE ARMY',
      title: 'IT Support Services for Army Sustainment Command - Repost',
    });
    const results = findDupCandidates([a, b]);

    expect(results).toHaveLength(1);
    expect(results[0]!.tier).toBe('STRONG');
    expect(results[0]!.match_method).toBe('dup_solicitation_number');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Determinism
// ═════════════════════════════════════════════════════════════════════════════

describe('findDupCandidates — determinism', () => {
  it('shuffling input order yields identical output ordering', () => {
    const opps: DupOpportunity[] = [
      makeOpp({
        id: 600,
        solicitation_number: '36C24225Q1071',
        naics: '541512',
        agency: 'VETERANS AFFAIRS',
        title: 'VA Medical Center IT Modernization',
      }),
      makeOpp({
        id: 601,
        solicitation_number: '36C24225Q1071',
        naics: '541512',
        agency: 'VETERANS AFFAIRS',
        title: 'VA Medical Center IT Modernization - Phase 2',
      }),
      makeOpp({
        id: 602,
        naics: '541512',
        agency: 'VETERANS AFFAIRS',
        title: 'VA Medical Center IT Modernization - Phase 3',
      }),
    ];

    const baseline = findDupCandidates(opps);

    for (let trial = 0; trial < 5; trial++) {
      const shuffled = shuffle(opps);
      const result = findDupCandidates(shuffled);
      expect(result).toEqual(baseline);
    }
  });
});
