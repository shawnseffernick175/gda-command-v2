/**
 * Fiscal calendar utilities.
 *
 * Federal fiscal year runs Oct-Sep (FY_START_MONTH = 10).
 * FY26 = Oct 2025 through Sep 2026.
 */

export type CalendarMode = 'FY' | 'CY';

/** Federal fiscal year starts in October. */
export const FY_START_MONTH = 10;

export interface MonthDef {
  readonly mon: string;
  readonly quarter: number;
}

/** Fiscal year ordering: Oct-Sep with FY quarters. */
const FY_MONTHS: ReadonlyArray<MonthDef> = [
  { mon: 'Oct', quarter: 1 }, { mon: 'Nov', quarter: 1 }, { mon: 'Dec', quarter: 1 },
  { mon: 'Jan', quarter: 2 }, { mon: 'Feb', quarter: 2 }, { mon: 'Mar', quarter: 2 },
  { mon: 'Apr', quarter: 3 }, { mon: 'May', quarter: 3 }, { mon: 'Jun', quarter: 3 },
  { mon: 'Jul', quarter: 4 }, { mon: 'Aug', quarter: 4 }, { mon: 'Sep', quarter: 4 },
];

/** Calendar year ordering: Jan-Dec with CY quarters. */
const CY_MONTHS: ReadonlyArray<MonthDef> = [
  { mon: 'Jan', quarter: 1 }, { mon: 'Feb', quarter: 1 }, { mon: 'Mar', quarter: 1 },
  { mon: 'Apr', quarter: 2 }, { mon: 'May', quarter: 2 }, { mon: 'Jun', quarter: 2 },
  { mon: 'Jul', quarter: 3 }, { mon: 'Aug', quarter: 3 }, { mon: 'Sep', quarter: 3 },
  { mon: 'Oct', quarter: 4 }, { mon: 'Nov', quarter: 4 }, { mon: 'Dec', quarter: 4 },
];

/** Return the 12-month definition array for the given calendar mode. */
export function getMonthsForMode(mode: CalendarMode): ReadonlyArray<MonthDef> {
  return mode === 'FY' ? FY_MONTHS : CY_MONTHS;
}

/** Calendar month number (1-based): Jan=1 ... Dec=12. */
const MONTH_NUM: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * Fiscal month index (1-based) for an Oct-start FY.
 * Oct=1, Nov=2, Dec=3, Jan=4, Feb=5, ..., Sep=12.
 */
export function fiscalMonthIndex(monthAbbrev: string): number {
  const cm = MONTH_NUM[monthAbbrev];
  if (!cm) return 0;
  return cm >= FY_START_MONTH
    ? cm - FY_START_MONTH + 1
    : cm + (12 - FY_START_MONTH + 1);
}

/** Fiscal quarter (1-4) for an Oct-start FY. Q1=Oct-Dec, Q2=Jan-Mar, ... */
export function fiscalQuarter(monthAbbrev: string): number {
  const fmi = fiscalMonthIndex(monthAbbrev);
  return fmi > 0 ? Math.ceil(fmi / 3) : 0;
}

/** Calendar quarter (1-4). Q1=Jan-Mar, Q2=Apr-Jun, ... */
export function calendarQuarter(monthAbbrev: string): number {
  const cm = MONTH_NUM[monthAbbrev];
  return cm > 0 ? Math.ceil(cm / 3) : 0;
}

/**
 * Extract calendar mode from a fy string like "FY26" or "CY26".
 * Defaults to 'FY' if the prefix is absent or unrecognized.
 */
export function parseCalendarMode(fy: string): CalendarMode {
  const upper = fy.trim().toUpperCase();
  if (upper.startsWith('CY')) return 'CY';
  return 'FY';
}

/**
 * Return the quarter number for a given month abbreviation in the given mode.
 */
export function quarterForMode(monthAbbrev: string, mode: CalendarMode): number {
  return mode === 'FY' ? fiscalQuarter(monthAbbrev) : calendarQuarter(monthAbbrev);
}
