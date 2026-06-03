/**
 * F-451: Integration test — extractFeaturesFromOpportunity + scoreV1Rules
 * verifies that enriched features produce appropriate bands.
 */

import { describe, it, expect } from 'vitest';
import { extractFeaturesFromOpportunity, type OpportunityRow } from '../src/services/pwin/feature-extraction.js';
import { scoreV1Rules } from '../src/services/pwin/rules-scorer.js';

const NOW = new Date('2026-06-01T00:00:00Z');

function makeRow(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    naics: null,
    agency: null,
    set_aside: null,
    value_min: null,
    value_max: null,
    response_due_at: '2026-12-01T00:00:00Z',
    posted_at: '2026-05-01T00:00:00Z',
    incumbent: null,
    incumbent_confidence: null,
    solicitation_number: null,
    title: null,
    description: null,
    psc: null,
    ...overrides,
  };
}

describe('F-451 integration: enriched features → score ≥ 70 (forecast)', () => {
  it('strong-fit row (logistics + Army + RS3 + NAICS lane) yields forecast band', () => {
    const row = makeRow({
      title: 'Sustainment Logistics Field Service Support',
      description:
        'RS3 task order for C5ISR integration, systems engineering, maintenance, ' +
        'training, and readiness support for Army TACOM. Requires Secret clearance.',
      agency: 'Department of the Army',
      naics: '541330',
      set_aside: 'Total Small Business Set-Aside',
    });

    const features = extractFeaturesFromOpportunity(row, NOW);
    const result = scoreV1Rules(features, 'v1-rules');

    // Expect forecast band (score >= 70)
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('strong-fit row with NAICS 541715 and multiple offerings yields high score', () => {
    const row = makeRow({
      title: 'C5ISR Sustainment and Integration',
      description:
        'OASIS task order for field service, logistics, systems engineering, ' +
        'maintenance, and readiness depot support.',
      agency: 'USCG',
      naics: '541715',
    });

    const features = extractFeaturesFromOpportunity(row, NOW);
    const result = scoreV1Rules(features, 'v1-rules');

    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});

describe('F-451 integration: weak/off-lane row yields discovery', () => {
  it('weak row (no text, unknown NAICS, unknown agency) yields < 45 (discovery)', () => {
    const row = makeRow({
      naics: '999999',
      agency: 'Department of Education',
    });

    const features = extractFeaturesFromOpportunity(row, NOW);
    const result = scoreV1Rules(features, 'v1-rules');

    expect(result.score).toBeLessThan(45);
  });

  it('off-lane row with unrelated scope scores low', () => {
    const row = makeRow({
      title: 'Janitorial Cleaning Contract',
      description: 'Provide custodial and groundskeeping at office buildings',
      agency: 'Department of Agriculture',
      naics: '561720',
    });

    const features = extractFeaturesFromOpportunity(row, NOW);
    const result = scoreV1Rules(features, 'v1-rules');

    expect(result.score).toBeLessThan(45);
  });

  it('exclusion-triggered row scores 0', () => {
    const row = makeRow({
      title: 'Staff Augmentation Contract',
      description: 'Body shop labor hour support for general admin tasks',
      agency: null,
      naics: '999999',
    });

    const features = extractFeaturesFromOpportunity(row, NOW);
    const result = scoreV1Rules(features, 'v1-rules');

    expect(result.score).toBe(0);
  });
});
