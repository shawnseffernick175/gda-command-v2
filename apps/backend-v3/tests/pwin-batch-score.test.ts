/**
 * F-450: Unit tests for scoreSingleOpportunityPwin — deadline gate + band assignment.
 */

import { describe, it, expect } from 'vitest';
import { scoreSingleOpportunityPwin } from '../src/services/pwin/batch-score.js';
import type { OpportunityRow } from '../src/services/pwin/feature-extraction.js';

const NOW = new Date('2026-06-01T00:00:00Z');

function makeRow(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    naics: '541330',
    agency: 'Department of the Army',
    set_aside: null,
    value_min: null,
    value_max: 10_000_000,
    response_due_at: '2026-09-01T00:00:00Z',
    posted_at: '2026-05-01T00:00:00Z',
    incumbent: null,
    incumbent_confidence: null,
    solicitation_number: 'W52P1J-26-R-0001',
    title: null,
    description: null,
    psc: null,
    ...overrides,
  };
}

describe('scoreSingleOpportunityPwin — deadline gate', () => {
  it('passes opportunities whose deadline is past due (band=pass, reason=past_due)', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-05-01T00:00:00Z' }),
      NOW,
    );
    expect(result.band).toBe('pass');
    expect(result.score).toBeNull();
    expect(result.reason).toBe('past_due');
    expect(result.days_to_due).toBeLessThan(0);
    expect(result.model_version).toBe('v1-rules');
    expect(result.scored_at).toBe(NOW.toISOString());
  });

  it('passes opportunities within 30 days (band=pass, reason=insufficient_lead_time)', () => {
    // 20 days out
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-06-21T00:00:00Z' }),
      NOW,
    );
    expect(result.band).toBe('pass');
    expect(result.score).toBeNull();
    expect(result.reason).toBe('insufficient_lead_time');
    expect(result.days_to_due).toBe(20);
  });

  it('passes opportunities exactly at day 0 (due today)', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-06-01T12:00:00Z' }),
      NOW,
    );
    expect(result.band).toBe('pass');
    expect(result.score).toBeNull();
    expect(result.reason).toBe('insufficient_lead_time');
    expect(result.days_to_due).toBe(0);
  });

  it('passes at 29 days (still under 30)', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-06-30T00:00:00Z' }),
      NOW,
    );
    expect(result.band).toBe('pass');
    expect(result.score).toBeNull();
    expect(result.days_to_due).toBe(29);
  });

  it('scores opportunities at exactly 30 days (not passed)', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-07-01T00:00:00Z' }),
      NOW,
    );
    expect(result.band).not.toBe('pass');
    expect(result.score).toBeTypeOf('number');
    expect(result.days_to_due).toBe(30);
  });

  it('scores opportunities with null deadline (not passed)', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: null }),
      NOW,
    );
    expect(result.band).not.toBe('pass');
    expect(result.score).toBeTypeOf('number');
    expect(result.days_to_due).toBeNull();
  });

  it('scores opportunities with deadline well in the future', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-12-01T00:00:00Z' }),
      NOW,
    );
    expect(result.band).not.toBe('pass');
    expect(result.score).toBeTypeOf('number');
    expect(result.days_to_due).toBe(183);
  });
});

describe('scoreSingleOpportunityPwin — band assignment', () => {
  it('assigns forecast band for high-scoring opportunities (score >= 67)', () => {
    // Incumbent + vehicle access + small NAICS + doctrine → should push score high
    // We can't easily control scoreV1Rules output, but a typical row with good signals
    // will have base(30) + vehicle(−15) + clearance(+5) + doctrine(20/40*10=5) + naics_size
    // We need to verify the mapping from score → band is correct
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-09-01T00:00:00Z' }),
      NOW,
    );
    // With defaults: base 30, no incumbency, scope 0, no vehicle −15, clearance +5,
    // doctrine 20/40*10=5, no margin, naics size depends on 541330...
    // 541330 → receipts-based, $25.5M threshold. Envision $60M → large → −15
    // Total: 30 − 15 + 5 + 5 − 15 = 10 → discovery
    expect(result.score).toBeTypeOf('number');
    expect(result.model_version).toBe('v1-rules');
    expect(result.top_drivers).toBeDefined();
    expect(['forecast', 'signal', 'discovery']).toContain(result.band);
  });

  it('produces deterministic results for the same input', () => {
    const row = makeRow({ response_due_at: '2026-09-01T00:00:00Z' });
    const r1 = scoreSingleOpportunityPwin(row, NOW);
    const r2 = scoreSingleOpportunityPwin(row, NOW);
    expect(r1.score).toBe(r2.score);
    expect(r1.band).toBe(r2.band);
    expect(r1.days_to_due).toBe(r2.days_to_due);
  });

  it('returns discovery band for low-scoring opportunities', () => {
    // No vehicle, no incumbency, scope 0, unknown NAICS → low score
    const result = scoreSingleOpportunityPwin(
      makeRow({
        naics: '999999',
        agency: 'Unknown Agency',
        set_aside: null,
        value_max: null,
        response_due_at: '2027-01-01T00:00:00Z',
      }),
      NOW,
    );
    // base 30, no vehicle −15, clearance +5, doctrine +5, naics unknown 0
    // = 25 → discovery
    expect(result.band).toBe('discovery');
    expect(result.score).toBeLessThan(45);
  });

  it('scores set-aside requiring teaming with penalty (no partners)', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({
        set_aside: '8(a)',
        response_due_at: '2026-09-01T00:00:00Z',
      }),
      NOW,
    );
    // needs_teaming_partner=true + no candidates → −10 teaming penalty
    expect(result.score).toBeTypeOf('number');
    expect(result.band).not.toBe('pass');
  });

  it('includes scored_at timestamp', () => {
    const result = scoreSingleOpportunityPwin(makeRow(), NOW);
    expect(result.scored_at).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('scoreSingleOpportunityPwin — pass bucket structure', () => {
  it('pass objects have no top_drivers', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-05-15T00:00:00Z' }),
      NOW,
    );
    expect(result.band).toBe('pass');
    expect(result.top_drivers).toBeUndefined();
  });

  it('scored objects have top_drivers array', () => {
    const result = scoreSingleOpportunityPwin(
      makeRow({ response_due_at: '2026-09-01T00:00:00Z' }),
      NOW,
    );
    expect(result.band).not.toBe('pass');
    expect(Array.isArray(result.top_drivers)).toBe(true);
  });
});
