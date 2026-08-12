/**
 * Fiscal-year-to-date rollup of quarterly company figures.
 *
 * The Financial Bible's header tiles read "YTD", so they must cover every
 * quarter the book states for the current fiscal year — a single latest-quarter
 * row is one quarter, not the year to date, and reported FY26 Q2's $9.18M as
 * year-to-date revenue where Q1 + Q2 is $19.03M (the figure the cost-pool book
 * reconciles to).
 *
 * Dollars sum. Margin does not: it is revenue-weighted (gross-profit dollars,
 * margin% x sales, over total sales), and return on sales is recomputed from the
 * year-to-date dollars. A quarter that states no revenue contributes no weight,
 * and when the span states no revenue at all the ratios are null rather than a
 * fabricated zero.
 */

export interface QuarterFigures {
  fiscal_year: number;
  quarter: number;
  /** Revenue for the quarter. */
  sales: number;
  /** Operating income for the quarter. */
  ebit: number;
  /** New orders booked in the quarter. */
  orders: number;
  /** Gross margin as a percentage of the quarter's revenue. */
  gross_margin_pct: number | null;
}

export interface FiscalYearToDate {
  fiscal_year: number;
  /** Latest quarter included, so the scope can be labelled honestly. */
  through_quarter: number;
  sales: number;
  ebit: number;
  orders: number;
  gross_margin_pct: number | null;
  ros_pct: number | null;
  quarters_included: number;
}

/**
 * Roll up the most recent fiscal year present in `rows`, optionally capped at
 * `throughQuarter` so a plan can be trimmed to the quarters actuals cover.
 * Returns null when no quarter of that year is in scope.
 */
export function rollUpFiscalYearToDate(
  rows: QuarterFigures[],
  throughQuarter?: number,
): FiscalYearToDate | null {
  if (rows.length === 0) return null;

  const fiscalYear = Math.max(...rows.map((r) => r.fiscal_year));
  const scoped = rows.filter(
    (r) =>
      r.fiscal_year === fiscalYear &&
      (throughQuarter === undefined || r.quarter <= throughQuarter),
  );
  if (scoped.length === 0) return null;

  let sales = 0;
  let ebit = 0;
  let orders = 0;
  let grossProfit = 0;
  let marginWeight = 0;

  for (const r of scoped) {
    sales += r.sales;
    ebit += r.ebit;
    orders += r.orders;
    if (r.gross_margin_pct !== null) {
      grossProfit += r.sales * (r.gross_margin_pct / 100);
      marginWeight += r.sales;
    }
  }

  return {
    fiscal_year: fiscalYear,
    through_quarter: Math.max(...scoped.map((r) => r.quarter)),
    sales,
    ebit,
    orders,
    gross_margin_pct: marginWeight !== 0 ? (grossProfit / marginWeight) * 100 : null,
    ros_pct: sales !== 0 ? (ebit / sales) * 100 : null,
    quarters_included: scoped.length,
  };
}

/** Scope label for the tiles, e.g. "FY26 YTD (through Q2)". */
export function fiscalYearToDateLabel(ytd: FiscalYearToDate): string {
  return `FY${String(ytd.fiscal_year).slice(-2)} YTD (through Q${ytd.through_quarter})`;
}
