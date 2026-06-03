/**
 * F-452: Recompete signal + named-incumbent extraction tests.
 */

import { describe, it, expect } from 'vitest';
import { deriveSignals, type EnrichmentInput } from '../src/services/pwin/enrich-features.js';
import { scoreV1Rules } from '../src/services/pwin/rules-scorer.js';
import type { PwinFeatures } from '../src/services/pwin/types.js';

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
    set_aside: null,
    ...overrides,
  };
}

// ── deriveSignals: recompete detection (new keywords) ───────────────────────

describe('F-452 deriveSignals — augmented recompete detection', () => {
  it('sets is_recompete=true for title containing "Follow-On"', () => {
    const s = deriveSignals(makeInput({ title: 'Follow-On Support Services' }));
    expect(s.is_recompete).toBe(true);
  });

  it('sets is_recompete=true for title containing "Recompete of the ..."', () => {
    const s = deriveSignals(makeInput({ title: 'Recompete of the Logistics Support Contract' }));
    expect(s.is_recompete).toBe(true);
  });

  it('sets is_recompete=false for a plain new requirement', () => {
    const s = deriveSignals(makeInput({ title: 'New IT Modernization Program' }));
    expect(s.is_recompete).toBe(false);
  });

  it('detects re-solicitation keyword', () => {
    const s = deriveSignals(makeInput({ title: 'Re-solicitation for Base Operations' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects resolicitation keyword', () => {
    const s = deriveSignals(makeInput({ title: 'Resolicitation of prior contract' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects successor contract keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Successor contract for LOGCAP' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects incumbent contractor keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Incumbent contractor is required to transition' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects incumbent vendor keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Incumbent vendor performance review' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects option to extend keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Option to extend current services' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects continuation of keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Continuation of maintenance support' }));
    expect(s.is_recompete).toBe(true);
  });

  it('detects previously awarded keyword', () => {
    const s = deriveSignals(makeInput({ description: 'Previously awarded to CACI' }));
    expect(s.is_recompete).toBe(true);
  });
});

// ── deriveSignals: incumbent_competitor extraction ──────────────────────────

describe('F-452 deriveSignals — incumbent_competitor extraction', () => {
  it('sets incumbent_competitor="Northrop Grumman" for title with "Northrop Grumman Systems Corporation (NGSC)"', () => {
    const s = deriveSignals(makeInput({
      title: 'Northrop Grumman Systems Corporation (NGSC) Support Contract',
    }));
    expect(s.incumbent_competitor).toBe('Northrop Grumman');
  });

  it('returns empty string when no prime is named', () => {
    const s = deriveSignals(makeInput({
      title: 'New IT Modernization Program',
    }));
    expect(s.incumbent_competitor).toBe('');
  });

  it('a name alone (no recompete keyword) does NOT set is_recompete', () => {
    const s = deriveSignals(makeInput({
      title: 'Boeing Technical Evaluation',
    }));
    expect(s.incumbent_competitor).toBe('Boeing');
    expect(s.is_recompete).toBe(false);
  });

  it('detects SAIC with word-boundary check (no false positive on "mosaic")', () => {
    const s = deriveSignals(makeInput({ title: 'SAIC follow-on contract' }));
    expect(s.incumbent_competitor).toBe('SAIC');
    expect(s.is_recompete).toBe(true);

    const noMatch = deriveSignals(makeInput({ title: 'Mosaic program integration' }));
    expect(noMatch.incumbent_competitor).toBe('');
  });

  it('detects CACI with word-boundary check (no false positive)', () => {
    const s = deriveSignals(makeInput({ title: 'CACI international recompete' }));
    expect(s.incumbent_competitor).toBe('CACI');

    const noMatch = deriveSignals(makeInput({ title: 'Efficacy study of new radar' }));
    expect(noMatch.incumbent_competitor).toBe('');
  });

  it('detects Leidos in description', () => {
    const s = deriveSignals(makeInput({ description: 'Currently performed by Leidos' }));
    expect(s.incumbent_competitor).toBe('Leidos');
  });

  it('detects L3Harris (space variant)', () => {
    const s = deriveSignals(makeInput({ title: 'L3 Harris sensor maintenance' }));
    expect(s.incumbent_competitor).toBe('L3Harris');
  });

  it('detects Booz Allen Hamilton', () => {
    const s = deriveSignals(makeInput({ title: 'Booz Allen advisory services' }));
    expect(s.incumbent_competitor).toBe('Booz Allen Hamilton');
  });

  it('detects GDIT (word-boundary)', () => {
    const s = deriveSignals(makeInput({ title: 'GDIT contract renewal' }));
    expect(s.incumbent_competitor).toBe('General Dynamics');
  });

  it('detects Peraton', () => {
    const s = deriveSignals(makeInput({ title: 'Peraton signals intelligence' }));
    expect(s.incumbent_competitor).toBe('Peraton');
  });

  it('detects ManTech', () => {
    const s = deriveSignals(makeInput({ title: 'ManTech logistics support' }));
    expect(s.incumbent_competitor).toBe('ManTech');
  });

  it('first match wins when multiple primes named', () => {
    const s = deriveSignals(makeInput({
      title: 'Northrop Grumman and Boeing joint venture recompete',
    }));
    expect(s.incumbent_competitor).toBe('Northrop Grumman');
  });
});

// ── scoreV1Rules: recompete bonus ──────────────────────────────────────────

describe('F-452 scoreV1Rules — recompete bonus', () => {
  it('is_recompete=true adds exactly +8 vs an otherwise-identical false feature set', () => {
    const withRecompete = scoreV1Rules(makeFeatures({ is_recompete: true }), 'v1-rules');
    const noRecompete = scoreV1Rules(makeFeatures({ is_recompete: false }), 'v1-rules');
    expect(withRecompete.score - noRecompete.score).toBe(8);
  });

  it('recompete driver appears only when is_recompete=true', () => {
    const withRecompete = scoreV1Rules(makeFeatures({ is_recompete: true }), 'v1-rules');
    const noRecompete = scoreV1Rules(makeFeatures({ is_recompete: false }), 'v1-rules');

    const recompeteContrib = withRecompete.feature_weights.find((w) => w.name === 'recompete');
    expect(recompeteContrib).toBeDefined();
    expect(recompeteContrib?.value).toBe(8);
    expect(recompeteContrib?.description).toBe('+8 recompete (known requirement, displacement target)');

    const noRecompeteContrib = noRecompete.feature_weights.find((w) => w.name === 'recompete');
    expect(noRecompeteContrib).toBeUndefined();
  });

  it('is_incumbent still contributes +30 only when true (regression guard)', () => {
    const withIncumbent = scoreV1Rules(makeFeatures({ is_incumbent: true }), 'v1-rules');
    const noIncumbent = scoreV1Rules(makeFeatures({ is_incumbent: false }), 'v1-rules');
    expect(withIncumbent.score - noIncumbent.score).toBe(30);

    const incumbContrib = withIncumbent.feature_weights.find((w) => w.name === 'incumbency_bonus');
    expect(incumbContrib?.value).toBe(30);
  });
});
