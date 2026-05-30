/**
 * Pricing guardrail thresholds — configurable, not hardcoded.
 * Change these values to adjust guardrail sensitivity.
 */
export const GUARDRAIL_THRESHOLDS = {
  MARGIN_WARN_PCT: 8,
  MARGIN_CRITICAL_PCT: 5,
  LABOR_RATE_WARN_HOURLY: 300,
} as const;
