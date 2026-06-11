import { describe, it, expect } from 'vitest';
import { ENVISION_NAICS } from '../src/constants/envision-naics.js';

const SIX_DIGIT_NAICS_RE = /^\d{6}$/;

describe('USAspending NAICS filter', () => {
  const filtered = [...ENVISION_NAICS].filter(code => SIX_DIGIT_NAICS_RE.test(code));

  it('returns only 6-digit numeric NAICS codes', () => {
    for (const code of filtered) {
      expect(code).toMatch(SIX_DIGIT_NAICS_RE);
    }
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('excludes GSA SIN codes 54151S and 54151HACS', () => {
    expect(filtered).not.toContain('54151S');
    expect(filtered).not.toContain('54151HACS');
  });

  it('does not mutate the ENVISION_NAICS constant', () => {
    expect(ENVISION_NAICS).toContain('54151S');
    expect(ENVISION_NAICS).toContain('54151HACS');
    expect(ENVISION_NAICS.length).toBe(18);
  });
});
