import { describe, it, expect } from 'vitest';
import { pwinFractionToPct, pwinBandFromPct } from '../src/lib/pwin-scale.js';

describe('pwinFractionToPct', () => {
  it('converts 0..1 fractions to rounded 0..100 percents', () => {
    expect(pwinFractionToPct(0)).toBe(0);
    expect(pwinFractionToPct(0.5)).toBe(50);
    expect(pwinFractionToPct(0.756)).toBe(76);
    expect(pwinFractionToPct(1)).toBe(100);
  });

  it('accepts numeric strings (pg NUMERIC arrives as string)', () => {
    expect(pwinFractionToPct('0.25')).toBe(25);
    expect(pwinFractionToPct('1')).toBe(100);
  });

  it('returns null for null/undefined/non-finite', () => {
    expect(pwinFractionToPct(null)).toBeNull();
    expect(pwinFractionToPct(undefined)).toBeNull();
    expect(pwinFractionToPct('not-a-number')).toBeNull();
    expect(pwinFractionToPct(NaN)).toBeNull();
  });

  it('does NOT re-scale a value already on the 0..100 axis (guards the 100x drift)', () => {
    // A 0..1 fraction stays under 100; the bug this file prevents is passing a
    // fraction where a percent is expected, which would surface e.g. 0.5 as "1%".
    expect(pwinFractionToPct(0.5)).not.toBe(1);
    expect(pwinFractionToPct(0.5)).toBe(50);
  });
});

describe('pwinBandFromPct', () => {
  it('bands on the 0..100 scale (>=70 high, >=40 medium, >0 low)', () => {
    expect(pwinBandFromPct(90)).toBe('high');
    expect(pwinBandFromPct(70)).toBe('high');
    expect(pwinBandFromPct(69)).toBe('medium');
    expect(pwinBandFromPct(40)).toBe('medium');
    expect(pwinBandFromPct(39)).toBe('low');
    expect(pwinBandFromPct(1)).toBe('low');
  });

  it('returns null for zero, negative, null and non-finite', () => {
    expect(pwinBandFromPct(0)).toBeNull();
    expect(pwinBandFromPct(-5)).toBeNull();
    expect(pwinBandFromPct(null)).toBeNull();
    expect(pwinBandFromPct(undefined)).toBeNull();
    expect(pwinBandFromPct('nope')).toBeNull();
  });

  it('round-trips a stored fraction into the correct band', () => {
    // 0.75 stored → 75% → high (previously banded on ac.pwin >= 70, i.e. 0.75
    // >= 70 = false → wrongly "low").
    expect(pwinBandFromPct(pwinFractionToPct(0.75))).toBe('high');
    expect(pwinBandFromPct(pwinFractionToPct(0.5))).toBe('medium');
    expect(pwinBandFromPct(pwinFractionToPct(0.1))).toBe('low');
  });
});
