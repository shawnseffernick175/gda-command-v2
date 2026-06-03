/**
 * F-450: Unit tests for extractFeaturesFromOpportunity.
 */

import { describe, it, expect } from 'vitest';
import {
  extractFeaturesFromOpportunity,
  type OpportunityRow,
} from '../src/services/pwin/feature-extraction.js';

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
    solicitation_number: 'W52P1J-26-R-0001',
    ...overrides,
  };
}

describe('extractFeaturesFromOpportunity', () => {
  it('maps null naics to empty string', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ naics: null }), NOW);
    expect(f.naics).toBe('');
  });

  it('passes through a populated naics', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ naics: '541715' }), NOW);
    expect(f.naics).toBe('541715');
  });

  it('maps null agency to empty string', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ agency: null }), NOW);
    expect(f.agency).toBe('');
  });

  it('converts value_max to ceiling_value_m in millions', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ value_max: 25_000_000 }), NOW);
    expect(f.ceiling_value_m).toBe(25);
  });

  it('falls back to value_min when value_max is null', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ value_max: null, value_min: 5_000_000 }),
      NOW,
    );
    expect(f.ceiling_value_m).toBe(5);
  });

  it('returns 0 ceiling_value_m when both values are null', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ value_max: null, value_min: null }),
      NOW,
    );
    expect(f.ceiling_value_m).toBe(0);
  });

  it('computes days_to_proposal_due as whole days from now', () => {
    // 2026-09-01 is 92 days after 2026-06-01
    const f = extractFeaturesFromOpportunity(makeRow(), NOW);
    expect(f.days_to_proposal_due).toBe(92);
  });

  it('returns 0 days_to_proposal_due when response_due_at is null', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ response_due_at: null }),
      NOW,
    );
    expect(f.days_to_proposal_due).toBe(0);
  });

  it('returns negative days_to_proposal_due for past deadlines', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ response_due_at: '2026-05-01T00:00:00Z' }),
      NOW,
    );
    expect(f.days_to_proposal_due).toBe(-31);
  });

  // ── Set-aside teaming mapping ────────────────────────────────────────

  it('maps 8(a) set-aside to needs_teaming_partner=true', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ set_aside: '8(a)' }), NOW);
    expect(f.needs_teaming_partner).toBe(true);
    expect(f.candidate_partners).toEqual([]);
  });

  it('maps HUBZone to needs_teaming_partner=true', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ set_aside: 'HUBZone Sole Source' }), NOW);
    expect(f.needs_teaming_partner).toBe(true);
  });

  it('maps SDVOSB to needs_teaming_partner=true', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ set_aside: 'Service-Disabled Veteran-Owned Small Business' }),
      NOW,
    );
    expect(f.needs_teaming_partner).toBe(true);
  });

  it('maps WOSB to needs_teaming_partner=true', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ set_aside: 'WOSB' }), NOW);
    expect(f.needs_teaming_partner).toBe(true);
  });

  it('maps EDWOSB to needs_teaming_partner=true', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ set_aside: 'Economically Disadvantaged Women-Owned Small Business' }),
      NOW,
    );
    expect(f.needs_teaming_partner).toBe(true);
  });

  it('maps Total Small Business Set-Aside to needs_teaming_partner=false', () => {
    const f = extractFeaturesFromOpportunity(
      makeRow({ set_aside: 'Total Small Business Set-Aside' }),
      NOW,
    );
    expect(f.needs_teaming_partner).toBe(false);
  });

  it('maps null set_aside to needs_teaming_partner=false', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ set_aside: null }), NOW);
    expect(f.needs_teaming_partner).toBe(false);
  });

  it('maps unknown set_aside to needs_teaming_partner=false', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ set_aside: 'Unrestricted' }), NOW);
    expect(f.needs_teaming_partner).toBe(false);
  });

  // ── Neutral defaults ─────────────────────────────────────────────────

  it('defaults clearance_fit to true (neutral — no penalty)', () => {
    const f = extractFeaturesFromOpportunity(makeRow(), NOW);
    expect(f.clearance_fit).toBe(true);
  });

  it('defaults doctrine_alignment_score to 20 (neutral midpoint)', () => {
    const f = extractFeaturesFromOpportunity(makeRow(), NOW);
    expect(f.doctrine_alignment_score).toBe(20);
  });

  it('defaults is_incumbent to false', () => {
    const f = extractFeaturesFromOpportunity(makeRow(), NOW);
    expect(f.is_incumbent).toBe(false);
  });

  it('defaults scope_match_score to 0', () => {
    const f = extractFeaturesFromOpportunity(makeRow(), NOW);
    expect(f.scope_match_score).toBe(0);
  });

  // ── Employee-based vs receipts-based NAICS (pass-through) ────────────

  it('passes through employee-based NAICS codes unchanged', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ naics: '541715' }), NOW);
    expect(f.naics).toBe('541715');
  });

  it('passes through receipts-based NAICS codes unchanged', () => {
    const f = extractFeaturesFromOpportunity(makeRow({ naics: '561210' }), NOW);
    expect(f.naics).toBe('561210');
  });
});
