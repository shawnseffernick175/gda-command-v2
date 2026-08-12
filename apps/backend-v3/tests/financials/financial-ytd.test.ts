import { describe, it, expect } from 'vitest';
import {
  rollUpFiscalYearToDate,
  fiscalYearToDateLabel,
  type QuarterFigures,
} from '../../src/lib/financial-ytd.js';

/** FY26 Q1/Q2 exactly as the prod Income Statement states them. */
const FY26: QuarterFigures[] = [
  { fiscal_year: 2026, quarter: 1, sales: 9854513.57, ebit: 123098.9, orders: 0, gross_margin_pct: 12.5 },
  { fiscal_year: 2026, quarter: 2, sales: 9177184.1, ebit: 86406.41, orders: 0, gross_margin_pct: 10.5 },
];

describe('fiscal-year-to-date rollup', () => {
  it('covers every stated quarter of the year, not just the latest', () => {
    const ytd = rollUpFiscalYearToDate(FY26)!;

    expect(ytd.through_quarter).toBe(2);
    expect(ytd.quarters_included).toBe(2);
    // Reconciles to the cost-pool book's $19,031,697.67 YTD revenue.
    expect(ytd.sales).toBeCloseTo(19031697.67, 2);
    expect(ytd.ebit).toBeCloseTo(209505.31, 2);
    expect(fiscalYearToDateLabel(ytd)).toBe('FY26 YTD (through Q2)');
  });

  it('weights margin by revenue and recomputes return on sales', () => {
    const ytd = rollUpFiscalYearToDate(FY26)!;

    const grossProfit = 9854513.57 * 0.125 + 9177184.1 * 0.105;
    expect(ytd.gross_margin_pct).toBeCloseTo((grossProfit / ytd.sales) * 100, 6);
    expect(ytd.ros_pct).toBeCloseTo((ytd.ebit / ytd.sales) * 100, 6);
  });

  it('reads only the most recent fiscal year', () => {
    const ytd = rollUpFiscalYearToDate([
      { fiscal_year: 2025, quarter: 4, sales: 5_000_000, ebit: 100_000, orders: 0, gross_margin_pct: 20 },
      ...FY26,
    ])!;

    expect(ytd.fiscal_year).toBe(2026);
    expect(ytd.sales).toBeCloseTo(19031697.67, 2);
  });

  it('trims a plan to the quarters the actuals cover', () => {
    const planQuarters: QuarterFigures[] = [1, 2, 3, 4].map((quarter) => ({
      fiscal_year: 2026,
      quarter,
      sales: 8499999.99,
      ebit: 255000,
      orders: 0,
      gross_margin_pct: 18,
    }));

    const plan = rollUpFiscalYearToDate(planQuarters, 2)!;

    expect(plan.quarters_included).toBe(2);
    expect(plan.sales).toBeCloseTo(16999999.98, 2);
    expect(plan.gross_margin_pct).toBeCloseTo(18, 6);
  });

  it('leaves ratios unavailable rather than zero when no revenue is stated', () => {
    const ytd = rollUpFiscalYearToDate([
      { fiscal_year: 2026, quarter: 1, sales: 0, ebit: 0, orders: 12, gross_margin_pct: null },
    ])!;

    expect(ytd.orders).toBe(12);
    expect(ytd.gross_margin_pct).toBeNull();
    expect(ytd.ros_pct).toBeNull();
  });

  it('returns nothing when the book states no quarters', () => {
    expect(rollUpFiscalYearToDate([])).toBeNull();
  });

  it('ignores a quarter that states no margin when weighting', () => {
    const ytd = rollUpFiscalYearToDate([
      { fiscal_year: 2026, quarter: 1, sales: 1_000_000, ebit: 50_000, orders: 0, gross_margin_pct: 20 },
      { fiscal_year: 2026, quarter: 2, sales: 1_000_000, ebit: 50_000, orders: 0, gross_margin_pct: null },
    ])!;

    expect(ytd.sales).toBe(2_000_000);
    expect(ytd.gross_margin_pct).toBeCloseTo(20, 6);
  });
});
