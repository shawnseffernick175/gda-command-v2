// ---------------------------------------------------------------------------
// Pricing Guardrail — validates margin against FY26 board plan minimum.
// ---------------------------------------------------------------------------

export interface PricingAssumptions {
  labor_rate?: number;
  overhead_pct?: number;
  fringe_pct?: number;
  fee_pct?: number;
  margin_pct?: number;
  notes?: string;
}

export interface PricingGuardrailResult {
  pass: boolean | null;
  alert: string | null;
}

const MARGIN_FLOOR = 10;

export function checkPricingGuardrails(
  assumptions: PricingAssumptions,
): PricingGuardrailResult {
  if (assumptions.margin_pct == null) {
    return {
      pass: null,
      alert:
        "Margin % not entered. Enter pricing assumptions to validate guardrail.",
    };
  }

  if (assumptions.margin_pct < MARGIN_FLOOR) {
    return {
      pass: false,
      alert: `Gross margin ${assumptions.margin_pct}% is below the 10% floor (FY26 board plan minimum). Adjust pricing before advancing.`,
    };
  }

  return { pass: true, alert: null };
}
