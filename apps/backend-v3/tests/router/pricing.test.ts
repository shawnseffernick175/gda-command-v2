/**
 * Pricing table tests.
 */

import { describe, it, expect } from 'vitest';
import { estimateCost, PRICING_TABLE } from '../../src/lib/router/pricing.js';

describe('[Pricing] estimateCost', () => {
  it('calculates Haiku cost correctly', () => {
    const cost = estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.80 + 4.00, 2);
  });

  it('calculates Sonnet cost correctly', () => {
    const cost = estimateCost('claude-sonnet-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3.00 + 15.00, 2);
  });

  it('calculates Opus cost correctly', () => {
    const cost = estimateCost('claude-opus-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(15.00 + 75.00, 2);
  });

  it('calculates embedding cost correctly (output=0)', () => {
    const cost = estimateCost('text-embedding-3-large', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.13, 2);
  });

  it('returns 0 for unknown model', () => {
    const cost = estimateCost('unknown-model', 1000, 1000);
    expect(cost).toBe(0);
  });

  it('scales linearly with token count', () => {
    const cost1k = estimateCost('claude-haiku-4-5', 1_000, 1_000);
    const cost10k = estimateCost('claude-haiku-4-5', 10_000, 10_000);
    expect(cost10k).toBeCloseTo(cost1k * 10, 10);
  });

  it('pricing table has all expected models', () => {
    expect(PRICING_TABLE).toHaveProperty('claude-haiku-4-5');
    expect(PRICING_TABLE).toHaveProperty('claude-sonnet-4-5');
    expect(PRICING_TABLE).toHaveProperty('claude-opus-4-5');
    expect(PRICING_TABLE).toHaveProperty('text-embedding-3-large');
    expect(PRICING_TABLE).toHaveProperty('sonar-pro');
  });
});
