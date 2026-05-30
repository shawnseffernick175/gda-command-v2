/**
 * Model pricing table — per-million token rates.
 * Update this file when model pricing changes.
 */

interface ModelPricing {
  input_per_million: number;
  output_per_million: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5': {
    input_per_million: 0.80,
    output_per_million: 4.00,
  },
  'claude-sonnet-4-5': {
    input_per_million: 3.00,
    output_per_million: 15.00,
  },
  'claude-opus-4-5': {
    input_per_million: 15.00,
    output_per_million: 75.00,
  },
  'text-embedding-3-large': {
    input_per_million: 0.13,
    output_per_million: 0,
  },
  'sonar-pro': {
    input_per_million: 3.00,
    output_per_million: 15.00,
  },
};

export function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (
    (tokensIn / 1_000_000) * pricing.input_per_million +
    (tokensOut / 1_000_000) * pricing.output_per_million
  );
}

export { PRICING };
