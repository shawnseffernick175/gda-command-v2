/**
 * F-451: Unit tests for deriveSignals — deterministic signal derivation.
 */

import { describe, it, expect } from 'vitest';
import { deriveSignals, type EnrichmentInput } from '../src/services/pwin/enrich-features.js';

function makeInput(overrides: Partial<EnrichmentInput> = {}): EnrichmentInput {
  return {
    title: null,
    description: null,
    agency: null,
    naics: null,
    psc: null,
    set_aside: null,
    incumbent: null,
    incumbent_confidence: null,
    ...overrides,
  };
}

describe('deriveSignals — scope_match_score', () => {
  it('returns 0 for null title and description with no NAICS lane', () => {
    const s = deriveSignals(makeInput());
    expect(s.scope_match_score).toBe(0);
  });

  it('returns NAICS lane bonus (+10) even with empty text', () => {
    const s = deriveSignals(makeInput({ naics: '541330' }));
    expect(s.scope_match_score).toBe(10);
  });

  it('scores 25 for 1 keyword match', () => {
    const s = deriveSignals(makeInput({ title: 'Logistics support services' }));
    expect(s.scope_match_score).toBe(25);
  });

  it('scores 45 for 2 keyword matches', () => {
    const s = deriveSignals(makeInput({
      title: 'Logistics and sustainment',
    }));
    expect(s.scope_match_score).toBe(45);
  });

  it('scores 60 for 3 keyword matches', () => {
    const s = deriveSignals(makeInput({
      title: 'Logistics sustainment and training',
    }));
    expect(s.scope_match_score).toBe(60);
  });

  it('scores 75 for 4 keyword matches', () => {
    const s = deriveSignals(makeInput({
      title: 'Logistics sustainment training and maintenance',
    }));
    expect(s.scope_match_score).toBe(75);
  });

  it('scores 90 for 5+ keyword matches', () => {
    const s = deriveSignals(makeInput({
      description: 'Logistics sustainment training maintenance and integration services',
    }));
    expect(s.scope_match_score).toBe(90);
  });

  it('caps at 100 with NAICS lane bonus on 5+ matches', () => {
    const s = deriveSignals(makeInput({
      naics: '541512',
      description: 'Logistics sustainment training maintenance and integration services',
    }));
    expect(s.scope_match_score).toBe(100);
  });

  it('adds +10 NAICS bonus to keyword score (3 matches + lane = 70)', () => {
    const s = deriveSignals(makeInput({
      naics: '541715',
      title: 'Logistics sustainment and training',
    }));
    expect(s.scope_match_score).toBe(70);
  });
});

describe('deriveSignals — vehicle detection', () => {
  it('detects RS3 vehicle keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Work under RS3 contract vehicle' }));
    expect(s.has_vehicle_access).toBe(true);
    expect(s.vehicle).toBe('RS3');
  });

  it('detects OASIS vehicle keyword', () => {
    const s = deriveSignals(makeInput({ title: 'OASIS task order' }));
    expect(s.has_vehicle_access).toBe(true);
    expect(s.vehicle).toBe('OASIS');
  });

  it('detects GSA vehicle keyword', () => {
    const s = deriveSignals(makeInput({ description: 'GSA schedule purchase' }));
    expect(s.has_vehicle_access).toBe(true);
    expect(s.vehicle).toBe('GSA');
  });

  it('returns false when no vehicle keywords found', () => {
    const s = deriveSignals(makeInput({ description: 'Regular procurement' }));
    expect(s.has_vehicle_access).toBe(false);
    expect(s.vehicle).toBe('');
  });
});

describe('deriveSignals — clearance detection + fit', () => {
  it('detects ts/sci clearance', () => {
    const s = deriveSignals(makeInput({ description: 'Requires TS/SCI clearance' }));
    expect(s.clearance_required).toBe('ts/sci');
    expect(s.clearance_fit).toBe(true);
  });

  it('sets clearance_fit=false for ts/sci + polygraph', () => {
    const s = deriveSignals(makeInput({ description: 'Requires TS/SCI with polygraph' }));
    expect(s.clearance_required).toBe('ts/sci');
    expect(s.clearance_fit).toBe(false);
  });

  it('detects top secret clearance', () => {
    const s = deriveSignals(makeInput({ description: 'Top Secret clearance required' }));
    expect(s.clearance_required).toBe('ts');
    expect(s.clearance_fit).toBe(true);
  });

  it('detects secret clearance', () => {
    const s = deriveSignals(makeInput({ description: 'Secret clearance needed' }));
    expect(s.clearance_required).toBe('secret');
    expect(s.clearance_fit).toBe(true);
  });

  it('returns empty string when no clearance cues', () => {
    const s = deriveSignals(makeInput({ description: 'No special requirements' }));
    expect(s.clearance_required).toBe('');
    expect(s.clearance_fit).toBe(true);
  });
});

describe('deriveSignals — existing customer', () => {
  it('detects Army as existing customer', () => {
    const s = deriveSignals(makeInput({ agency: 'Department of the Army' }));
    expect(s.is_existing_customer).toBe(true);
  });

  it('detects USCG as existing customer', () => {
    const s = deriveSignals(makeInput({ agency: 'US Coast Guard' }));
    expect(s.is_existing_customer).toBe(true);
  });

  it('detects DHS as existing customer', () => {
    const s = deriveSignals(makeInput({ agency: 'DHS FEMA' }));
    expect(s.is_existing_customer).toBe(true);
  });

  it('detects Veterans Affairs as existing customer', () => {
    const s = deriveSignals(makeInput({ agency: 'Department of Veterans Affairs' }));
    expect(s.is_existing_customer).toBe(true);
  });

  it('returns false for unknown agency', () => {
    const s = deriveSignals(makeInput({ agency: 'Department of Education' }));
    expect(s.is_existing_customer).toBe(false);
  });

  it('does not false-positive on agencies containing "va" substring', () => {
    const s = deriveSignals(makeInput({ agency: 'Defense Advanced Research Projects Agency' }));
    expect(s.is_existing_customer).toBe(false);
  });

  it('returns false for null agency', () => {
    const s = deriveSignals(makeInput({ agency: null }));
    expect(s.is_existing_customer).toBe(false);
  });
});

describe('deriveSignals — recompete cues', () => {
  it('detects recompete keyword', () => {
    const s = deriveSignals(makeInput({ description: 'This is a recompete of existing contract' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects re-compete keyword', () => {
    const s = deriveSignals(makeInput({ title: 'Re-compete for support services' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects follow-on keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Follow-on contract' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects follow on keyword (no hyphen)', () => {
    const s = deriveSignals(makeInput({ description: 'Follow on effort' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects bridge contract keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Bridge contract pending new award' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects currently performed keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Services currently performed by incumbent' }));
    expect(s.is_recompete).toBe(true);
  });

  it('returns false when no recompete cues', () => {
    const s = deriveSignals(makeInput({ description: 'New requirement' }));
    expect(s.is_recompete).toBe(false);
  });
});

describe('deriveSignals — exclusion triggers', () => {
  it('triggers staff_aug_only exclusion', () => {
    const s = deriveSignals(makeInput({
      description: 'Staff augmentation support, labor hour contract',
    }));
    expect(s.exclusion_triggered).toBe(true);
    expect(s.exclusion_ids).toContain('staff_aug_only');
  });

  it('does not trigger staff_aug when solution keywords present', () => {
    const s = deriveSignals(makeInput({
      description: 'Staff augmentation with platform deliverable',
    }));
    expect(s.exclusion_triggered).toBe(false);
    expect(s.exclusion_ids).not.toContain('staff_aug_only');
  });

  it('triggers commercial_software_only exclusion (no agency)', () => {
    const s = deriveSignals(makeInput({
      agency: null,
      description: 'Commercial software development for SaaS product',
    }));
    expect(s.exclusion_triggered).toBe(true);
    expect(s.exclusion_ids).toContain('commercial_software_only');
  });

  it('does not trigger commercial_software when agency present', () => {
    const s = deriveSignals(makeInput({
      agency: 'Department of the Army',
      description: 'Commercial software development for SaaS product',
    }));
    expect(s.exclusion_triggered).toBe(false);
  });

  it('does not trigger commercial_software when gov nexus present', () => {
    const s = deriveSignals(makeInput({
      agency: null,
      description: 'SaaS product with FedRAMP authorization',
    }));
    expect(s.exclusion_triggered).toBe(false);
  });

  it('returns empty exclusion_ids for normal opportunities', () => {
    const s = deriveSignals(makeInput({
      agency: 'Army',
      description: 'Systems engineering and logistics support',
    }));
    expect(s.exclusion_triggered).toBe(false);
    expect(s.exclusion_ids).toEqual([]);
  });
});

describe('deriveSignals — is_incumbent', () => {
  it('returns true when incumbent matches Envision identity', () => {
    const s = deriveSignals(makeInput({ incumbent: 'Envision Sciences' }));
    expect(s.is_incumbent).toBe(true);
  });

  it('returns false when incumbent is null', () => {
    const s = deriveSignals(makeInput({ incumbent: null }));
    expect(s.is_incumbent).toBe(false);
  });

  it('returns false when incumbent is another company', () => {
    const s = deriveSignals(makeInput({ incumbent: 'CACI International' }));
    expect(s.is_incumbent).toBe(false);
  });
});

describe('deriveSignals — empty/null inputs', () => {
  it('handles all-null inputs gracefully', () => {
    const s = deriveSignals(makeInput());
    expect(s.scope_match_score).toBe(0);
    expect(s.has_vehicle_access).toBe(false);
    expect(s.vehicle).toBe('');
    expect(s.clearance_required).toBe('');
    expect(s.clearance_fit).toBe(true);
    expect(s.doctrine_alignment_score).toBe(4);
    expect(s.is_existing_customer).toBe(false);
    expect(s.is_recompete).toBe(false);
    expect(s.is_incumbent).toBe(false);
    expect(s.exclusion_triggered).toBe(false);
    expect(s.exclusion_ids).toEqual([]);
    expect(s.core_offering_match).toEqual([]);
  });
});
