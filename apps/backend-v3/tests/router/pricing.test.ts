/**
 * Unit tests for pricing table.
 */

import { describe, it, expect } from 'vitest';
import { estimateCost, PRICING } from '../../src/lib/router/pricing.js';

describe('Pricing', () => {
  it('has pricing for all models in the routing table', () => {
    const models = [
      'claude-haiku-4-5',
      'claude-sonnet-4-5',
      'claude-opus-4-5',
      'text-embedding-3-large',
      'sonar-pro',
    ];
    for (const model of models) {
      expect(PRICING[model]).toBeDefined();
    }
  });

  it('calculates cost correctly for claude-haiku-4-5', () => {
    const cost = estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.80 + 4.00, 2);
  });

  it('calculates cost correctly for claude-sonnet-4-5', () => {
    const cost = estimateCost('claude-sonnet-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3.00 + 15.00, 2);
  });

  it('calculates cost correctly for text-embedding-3-large', () => {
    const cost = estimateCost('text-embedding-3-large', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.13, 2);
  });

  it('returns 0 for unknown models', () => {
    const cost = estimateCost('unknown-model', 1000, 1000);
    expect(cost).toBe(0);
  });

  it('scales linearly with token count', () => {
    const cost1 = estimateCost('claude-haiku-4-5', 500_000, 250_000);
    const cost2 = estimateCost('claude-haiku-4-5', 1_000_000, 500_000);
    expect(cost2).toBeCloseTo(cost1 * 2, 6);
  });
});
