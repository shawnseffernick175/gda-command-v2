/**
 * F-302: Unit tests for the v1 rules-based PWin scorer.
 */

import { describe, it, expect } from 'vitest';
import { scoreV1Rules } from '../src/services/pwin/rules-scorer.js';
import type { PwinFeatures } from '../src/services/pwin/types.js';

function makeFeatures(overrides: Partial<PwinFeatures> = {}): PwinFeatures {
  return {
    vehicle: 'open_market',
    has_vehicle_access: true,
    vehicle_set_aside: 'sb',
    agency: 'army',
    sub_agency: 'cecom',
    is_existing_customer: false,
    naics: '541330',
    ceiling_value_m: 10,
    is_recompete: false,
    is_incumbent: false,
    incumbent_competitor: '',
    scope_match_score: 50,
    days_to_rfp_release: 30,
    days_to_proposal_due: 60,
    is_under_continuing_resolution: false,
    core_offering_match: ['logistics'],
    clearance_required: 'secret',
    clearance_fit: true,
    doctrine_alignment_score: 30,
    exclusion_triggered: false,
    exclusion_ids: [],
    expected_margin_pct: 12,
    below_margin_floor: false,
    needs_teaming_partner: false,
    candidate_partners: [],
    named_competitors_count: 3,
    competitor_incumbency_rate: 0.5,
    similar_awards_count: 5,
    avg_similar_award_value_m: 8,
    ...overrides,
  };
}

describe('v1 rules scorer', () => {
  it('returns deterministic scores for same features', () => {
    const features = makeFeatures();
    const r1 = scoreV1Rules(features, 'v1-rules');
    const r2 = scoreV1Rules(features, 'v1-rules');
    expect(r1.score).toBe(r2.score);
    expect(r1.feature_weights).toEqual(r2.feature_weights);
  });

  it('clamps score between 0 and 100', () => {
    const best = makeFeatures({
      is_incumbent: true,
      scope_match_score: 100,
      has_vehicle_access: true,
      clearance_fit: true,
      doctrine_alignment_score: 40,
      below_margin_floor: false,
      exclusion_triggered: false,
    });
    const worst = makeFeatures({
      is_incumbent: false,
      scope_match_score: 0,
      has_vehicle_access: false,
      clearance_fit: false,
      doctrine_alignment_score: 0,
      below_margin_floor: true,
      needs_teaming_partner: true,
      candidate_partners: [],
    });

    const bestResult = scoreV1Rules(best, 'v1-rules');
    const worstResult = scoreV1Rules(worst, 'v1-rules');

    expect(bestResult.score).toBeLessThanOrEqual(100);
    expect(bestResult.score).toBeGreaterThanOrEqual(0);
    expect(worstResult.score).toBeLessThanOrEqual(100);
    expect(worstResult.score).toBeGreaterThanOrEqual(0);
  });

  it('adds +30 for incumbency', () => {
    const noIncumbent = scoreV1Rules(makeFeatures({ is_incumbent: false }), 'v1-rules');
    const withIncumbent = scoreV1Rules(makeFeatures({ is_incumbent: true }), 'v1-rules');
    expect(withIncumbent.score - noIncumbent.score).toBe(30);
  });

  it('adds +10 for vehicle access, -15 without', () => {
    const withAccess = scoreV1Rules(makeFeatures({ has_vehicle_access: true }), 'v1-rules');
    const noAccess = scoreV1Rules(makeFeatures({ has_vehicle_access: false }), 'v1-rules');
    expect(withAccess.score - noAccess.score).toBe(25);
  });

  it('adds +5 for clearance fit, -10 without', () => {
    const fit = scoreV1Rules(makeFeatures({ clearance_fit: true }), 'v1-rules');
    const noFit = scoreV1Rules(makeFeatures({ clearance_fit: false }), 'v1-rules');
    expect(fit.score - noFit.score).toBe(15);
  });

  it('clamps to 0 when exclusion is triggered', () => {
    const result = scoreV1Rules(makeFeatures({ exclusion_triggered: true }), 'v1-rules');
    expect(result.score).toBe(0);
  });

  it('penalizes -20 for below margin floor', () => {
    const ok = scoreV1Rules(makeFeatures({ below_margin_floor: false }), 'v1-rules');
    const below = scoreV1Rules(makeFeatures({ below_margin_floor: true }), 'v1-rules');
    expect(ok.score - below.score).toBe(20);
  });

  it('teaming: +5 with partners, -10 without', () => {
    const withPartner = scoreV1Rules(
      makeFeatures({ needs_teaming_partner: true, candidate_partners: ['Riverstone'] }),
      'v1-rules',
    );
    const noPartner = scoreV1Rules(
      makeFeatures({ needs_teaming_partner: true, candidate_partners: [] }),
      'v1-rules',
    );
    expect(withPartner.score - noPartner.score).toBe(15);
  });

  it('returns model_version in result', () => {
    const result = scoreV1Rules(makeFeatures(), 'v1-rules');
    expect(result.model_version).toBe('v1-rules');
  });

  it('returns non-empty top_drivers', () => {
    const result = scoreV1Rules(makeFeatures(), 'v1-rules');
    expect(result.top_drivers.length).toBeGreaterThan(0);
    for (const driver of result.top_drivers) {
      expect(typeof driver).toBe('string');
      expect(driver.length).toBeGreaterThan(0);
    }
  });

  it('feature_weights contains all contributions', () => {
    const result = scoreV1Rules(makeFeatures(), 'v1-rules');
    const names = result.feature_weights.map((w) => w.name);
    expect(names).toContain('base');
    expect(names).toContain('vehicle_access');
    expect(names).toContain('clearance_fit');
    expect(names).toContain('doctrine_bonus');
  });

  it('doctrine bonus scales with score (0 gives 0, 40 gives 10)', () => {
    const zero = scoreV1Rules(makeFeatures({ doctrine_alignment_score: 0 }), 'v1-rules');
    const max = scoreV1Rules(makeFeatures({ doctrine_alignment_score: 40 }), 'v1-rules');
    expect(max.score - zero.score).toBe(10);
  });

  it('capability match scales with scope_match_score * 0.3', () => {
    const low = scoreV1Rules(makeFeatures({ scope_match_score: 0 }), 'v1-rules');
    const high = scoreV1Rules(makeFeatures({ scope_match_score: 100 }), 'v1-rules');
    expect(high.score - low.score).toBe(30);
  });
});
