import { describe, expect, it } from 'vitest';

import { resolveContractIncumbency } from '../../src/services/govwin/api_client.js';

/**
 * Fixtures below are trimmed from real `govwin_cache` rows captured on prod
 * (OPP232907 / OPP224873). Two properties of the live payload broke enrichment
 * and are pinned here: `company` is an ARRAY, and there is no `incumbent` flag.
 */
const NOW = Date.parse('2026-08-13T00:00:00Z');

describe('resolveContractIncumbency — live GovWin contract payloads', () => {
  it('reads the awardee from the company ARRAY (never an object on the wire)', () => {
    const { incumbent } = resolveContractIncumbency(
      [
        {
          id: 506809,
          company: [{ id: 5, name: 'ABT GLOBAL, LLC' }],
          awardDate: '2021-09-28T00:00:00.000',
          expirationDate: '2027-09-29T00:00:00.000',
        },
      ],
      NOW,
    );
    expect(incumbent).toBe('ABT GLOBAL, LLC');
  });

  it('derives the incumbent from the most recent unexpired award, rest are competitors', () => {
    const { incumbent, confidence, competitors } = resolveContractIncumbency(
      [
        {
          company: [{ name: 'OLD VENDOR INC' }],
          awardDate: '2018-01-01T00:00:00.000',
          expirationDate: '2020-01-01T00:00:00.000',
        },
        {
          company: [{ name: 'CURRENT HOLDER LLC' }],
          awardDate: '2024-06-01T00:00:00.000',
          expirationDate: '2028-06-01T00:00:00.000',
        },
        {
          company: [{ name: 'ANOTHER BIDDER CORP' }],
          awardDate: '2022-03-01T00:00:00.000',
          expirationDate: '2023-03-01T00:00:00.000',
        },
      ],
      NOW,
    );

    expect(incumbent).toBe('CURRENT HOLDER LLC');
    expect(confidence).toBe('high');
    expect(competitors).toEqual(['OLD VENDOR INC', 'ANOTHER BIDDER CORP']);
  });

  it('falls back to the latest expired award with medium confidence', () => {
    const { incumbent, confidence } = resolveContractIncumbency(
      [
        {
          company: [{ name: 'STALE ONE' }],
          awardDate: '2015-01-01T00:00:00.000',
          expirationDate: '2016-01-01T00:00:00.000',
        },
        {
          company: [{ name: 'MOST RECENT BUT EXPIRED' }],
          awardDate: '2021-09-28T00:00:00.000',
          expirationDate: '2024-09-29T00:00:00.000',
        },
      ],
      NOW,
    );

    expect(incumbent).toBe('MOST RECENT BUT EXPIRED');
    expect(confidence).toBe('medium');
  });

  it('treats extra companies on the winning contract as joint-venture competitors', () => {
    const { incumbent, competitors } = resolveContractIncumbency(
      [
        {
          company: [{ name: 'JV LEAD LLC' }, { name: 'JV PARTNER INC' }],
          awardDate: '2025-01-01T00:00:00.000',
          expirationDate: '2029-01-01T00:00:00.000',
        },
      ],
      NOW,
    );
    expect(incumbent).toBe('JV LEAD LLC');
    expect(competitors).toEqual(['JV PARTNER INC']);
  });

  it('still honours an explicit incumbent flag when a tier provides one', () => {
    const { incumbent, confidence, competitors } = resolveContractIncumbency(
      [
        {
          company: [{ name: 'NEWER AWARD CO' }],
          awardDate: '2025-01-01T00:00:00.000',
          expirationDate: '2029-01-01T00:00:00.000',
        },
        {
          incumbent: 'true',
          company: [{ name: 'FLAGGED INCUMBENT LLC' }],
          awardDate: '2019-01-01T00:00:00.000',
        },
      ],
      NOW,
    );
    expect(incumbent).toBe('FLAGGED INCUMBENT LLC');
    expect(confidence).toBe('high');
    expect(competitors).toEqual(['NEWER AWARD CO']);
  });

  it('returns nothing for the empty payloads GovWin serves as {} / no awardees', () => {
    expect(resolveContractIncumbency([], NOW)).toEqual({
      incumbent: null,
      confidence: null,
      competitors: [],
    });
    expect(resolveContractIncumbency([{ company: [] }], NOW).incumbent).toBeNull();
  });
});
