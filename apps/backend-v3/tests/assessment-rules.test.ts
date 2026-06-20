import { describe, it, expect } from 'vitest';
import {
  assessOpportunity,
  isProductPsc,
  isCommodityPurchase,
  ASSESSMENT_DEADLINE_DAYS,
  LOW_PWIN_THRESHOLD,
} from '../src/services/assessment/rules.js';

const NOW = new Date('2026-06-20T12:00:00Z');
const inDays = (d: number): string => new Date(NOW.getTime() + d * 86_400_000).toISOString();

// A baseline that survives to ops_tracker unless overridden.
const survivor = {
  naics: '541330',
  response_due_at: inDays(90),
  psc: 'R425', // service PSC (alpha lead)
  pwin_band: 'forecast',
  pwin_score: 80,
};

describe('assessOpportunity — ordered rules (first match wins)', () => {
  it('passes when NAICS is null (no_naics)', () => {
    const d = assessOpportunity({ ...survivor, naics: null }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('no_naics');
    expect(d.reason).toBe('pass: no_naics');
  });

  it('passes when NAICS is not in the Envision profile (out_of_naics)', () => {
    const d = assessOpportunity({ ...survivor, naics: '999999' }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('out_of_naics');
  });

  it('passes when deadline is within the threshold (deadline_lt_30d)', () => {
    const d = assessOpportunity({ ...survivor, response_due_at: inDays(ASSESSMENT_DEADLINE_DAYS - 1) }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('deadline_lt_30d');
  });

  it('passes when the opportunity is past due', () => {
    const d = assessOpportunity({ ...survivor, response_due_at: inDays(-5) }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('deadline_lt_30d');
  });

  it('does NOT pass at exactly the threshold (boundary is >= 30 days)', () => {
    const d = assessOpportunity({ ...survivor, response_due_at: inDays(ASSESSMENT_DEADLINE_DAYS) }, NOW);
    expect(d.status).toBe('ops_tracker');
  });

  it('passes a commodity purchase detected via product PSC (commodity_purchase)', () => {
    const d = assessOpportunity({ ...survivor, psc: '5821' }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('commodity_purchase');
  });

  it('passes a commodity purchase detected via part_number/quantity', () => {
    const d = assessOpportunity({ ...survivor, psc: null, part_number: 'NSN-12345', quantity: 10 }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('commodity_purchase');
  });

  it('passes on low pWin band', () => {
    const d = assessOpportunity({ ...survivor, pwin_band: 'pass', pwin_score: null }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('low_pwin');
  });

  it('passes on low pWin score below threshold', () => {
    const d = assessOpportunity({ ...survivor, pwin_band: 'discovery', pwin_score: LOW_PWIN_THRESHOLD - 1 }, NOW);
    expect(d.status).toBe('pass');
    expect(d.reason_code).toBe('low_pwin');
    expect(d.score).toBe(LOW_PWIN_THRESHOLD - 1);
  });

  it('routes a strong in-profile service opportunity to ops_tracker with its score', () => {
    const d = assessOpportunity(survivor, NOW);
    expect(d.status).toBe('ops_tracker');
    expect(d.reason_code).toBe('in_naics_good_fit');
    expect(d.score).toBe(80);
  });

  it('honours rule ORDER: no_naics wins even if deadline is also bad', () => {
    const d = assessOpportunity({ ...survivor, naics: null, response_due_at: inDays(1) }, NOW);
    expect(d.reason_code).toBe('no_naics');
  });

  it('honours rule ORDER: out_of_naics wins over commodity signal', () => {
    const d = assessOpportunity({ ...survivor, naics: '999999', psc: '5821' }, NOW);
    expect(d.reason_code).toBe('out_of_naics');
  });

  it('accepts a GSA MAS SIN as in-profile NAICS', () => {
    const d = assessOpportunity({ ...survivor, naics: '54151S' }, NOW);
    expect(d.status).toBe('ops_tracker');
  });
});

describe('isProductPsc', () => {
  it('treats a leading digit as a product', () => {
    expect(isProductPsc('5821')).toBe(true);
    expect(isProductPsc('10')).toBe(true);
  });
  it('treats a leading alpha as a service', () => {
    expect(isProductPsc('R425')).toBe(false);
    expect(isProductPsc('D310')).toBe(false);
  });
  it('returns false for empty/unknown', () => {
    expect(isProductPsc(null)).toBe(false);
    expect(isProductPsc('')).toBe(false);
    expect(isProductPsc('   ')).toBe(false);
  });
});

describe('isCommodityPurchase', () => {
  it('flags product opportunity_type strings', () => {
    expect(isCommodityPurchase({ naics: '541330', response_due_at: null, psc: null, opportunity_type: 'Product/Supply' })).toBe(true);
  });
  it('does not flag a clean service row', () => {
    expect(isCommodityPurchase({ naics: '541330', response_due_at: null, psc: 'R425' })).toBe(false);
  });
});
