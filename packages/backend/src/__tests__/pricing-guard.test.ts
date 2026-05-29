/**
 * F-102 Sprint 3: Pricing Guard unit tests.
 */

import { describe, it, expect } from "vitest";
import { checkPricingGuardrails } from "../lib/pricing-guard";

describe("Pricing Guardrail", () => {
  it("returns pass=false when margin_pct < 10", () => {
    const result = checkPricingGuardrails({ margin_pct: 8 });
    expect(result.pass).toBe(false);
    expect(result.alert).toContain("below the 10% floor");
  });

  it("returns pass=true when margin_pct >= 10", () => {
    const result = checkPricingGuardrails({ margin_pct: 15 });
    expect(result.pass).toBe(true);
    expect(result.alert).toBeNull();
  });

  it("returns pass=null when margin_pct is not provided", () => {
    const result = checkPricingGuardrails({});
    expect(result.pass).toBeNull();
    expect(result.alert).toContain("Margin % not entered");
  });

  it("returns pass=true for margin_pct exactly 10", () => {
    const result = checkPricingGuardrails({ margin_pct: 10 });
    expect(result.pass).toBe(true);
    expect(result.alert).toBeNull();
  });
});
