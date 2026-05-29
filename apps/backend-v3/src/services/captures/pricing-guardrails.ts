/**
 * Pricing guardrail evaluator.
 *
 * Computes warnings and criticals based on margin_pct and labor_rates.
 * Thresholds are imported from guardrails-config (not hardcoded).
 */

import { GUARDRAIL_THRESHOLDS } from './guardrails-config.js';

export interface PricingAssumptions {
  margin_pct?: number;
  labor_rates?: Record<string, number>;
}

export interface GuardrailAlert {
  field: string;
  message: string;
  value: number;
  threshold: number;
}

export interface PricingGuardrailResult {
  warnings: GuardrailAlert[];
  criticals: GuardrailAlert[];
}

export function evaluatePricingGuardrails(
  assumptions: PricingAssumptions
): PricingGuardrailResult {
  const warnings: GuardrailAlert[] = [];
  const criticals: GuardrailAlert[] = [];

  if (assumptions.margin_pct !== undefined) {
    if (assumptions.margin_pct < GUARDRAIL_THRESHOLDS.MARGIN_CRITICAL_PCT) {
      criticals.push({
        field: 'margin_pct',
        message: `Margin ${assumptions.margin_pct}% is below critical threshold of ${GUARDRAIL_THRESHOLDS.MARGIN_CRITICAL_PCT}%`,
        value: assumptions.margin_pct,
        threshold: GUARDRAIL_THRESHOLDS.MARGIN_CRITICAL_PCT,
      });
    } else if (assumptions.margin_pct < GUARDRAIL_THRESHOLDS.MARGIN_WARN_PCT) {
      warnings.push({
        field: 'margin_pct',
        message: `Margin ${assumptions.margin_pct}% is below warning threshold of ${GUARDRAIL_THRESHOLDS.MARGIN_WARN_PCT}%`,
        value: assumptions.margin_pct,
        threshold: GUARDRAIL_THRESHOLDS.MARGIN_WARN_PCT,
      });
    }
  }

  if (assumptions.labor_rates) {
    for (const [role, rate] of Object.entries(assumptions.labor_rates)) {
      if (rate > GUARDRAIL_THRESHOLDS.LABOR_RATE_WARN_HOURLY) {
        warnings.push({
          field: `labor_rates.${role}`,
          message: `Labor rate for '${role}' ($${rate}/hr) exceeds $${GUARDRAIL_THRESHOLDS.LABOR_RATE_WARN_HOURLY}/hr threshold`,
          value: rate,
          threshold: GUARDRAIL_THRESHOLDS.LABOR_RATE_WARN_HOURLY,
        });
      }
    }
  }

  return { warnings, criticals };
}
