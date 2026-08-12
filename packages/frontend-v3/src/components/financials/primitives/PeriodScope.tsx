"use client";

/**
 * One period control for every Financial Bible table: Month, Quarter, or
 * year-to-date. The tabs previously each grew their own scope handling (or none
 * at all), so the same book could be read at three different spans depending on
 * which tab you opened.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export type PeriodView = "Month" | "Quarter" | "YTD";
export const PERIOD_VIEWS: PeriodView[] = ["Month", "Quarter", "YTD"];

const MONTH_NAMES: Record<string, string> = {
  Jan: "January", Feb: "February", Mar: "March", Apr: "April",
  May: "May", Jun: "June", Jul: "July", Aug: "August",
  Sep: "September", Oct: "October", Nov: "November", Dec: "December",
};

const QUARTER_MONTHS: Record<string, string> = {
  Q1: "Jan–Mar", Q2: "Apr–Jun", Q3: "Jul–Sep", Q4: "Oct–Dec",
};

/** Quarter a fiscal month abbreviation falls in, e.g. "Apr" → "Q2". */
const MONTH_QUARTER: Record<string, string> = {
  Jan: "Q1", Feb: "Q1", Mar: "Q1",
  Apr: "Q2", May: "Q2", Jun: "Q2",
  Jul: "Q3", Aug: "Q3", Sep: "Q3",
  Oct: "Q4", Nov: "Q4", Dec: "Q4",
};

/** "FY26 Apr" → "April"; "Q2" → "Q2 (Apr–Jun)"; "YTD" → "YTD". */
export function periodLabel(p: string): string {
  if (p === "YTD") return "YTD";
  if (/^Q[1-4]$/.test(p)) return `${p} (${QUARTER_MONTHS[p]})`;
  return MONTH_NAMES[p.slice(-3)] ?? p;
}

/** Axis-sized label: "FY26 Apr" → "Apr". */
export function shortPeriod(p: string): string {
  return p === "YTD" || /^Q[1-4]$/.test(p) ? p : p.slice(-3);
}

export function quarterOfPeriod(p: string): string | null {
  return MONTH_QUARTER[p.slice(-3)] ?? null;
}

export interface PeriodScope {
  view: PeriodView;
  /** Resolved selection the API/filter reads: "FY26 Apr" | "Q2" | "YTD". */
  period: string;
  label: string;
  month: string | null;
  quarter: string | null;
  setView: (view: PeriodView) => void;
  setMonth: (month: string) => void;
  setQuarter: (quarter: string) => void;
}

/**
 * Scope state, defaulting to year-to-date. The option lists live with the data
 * (a span the book does not state is never offered), so `PeriodScopeSelector`
 * owns defaulting a fresh Month/Quarter entry to the latest stated period.
 */
export function usePeriodScope(initialView: PeriodView = "YTD"): PeriodScope {
  const [view, setView] = useState<PeriodView>(initialView);
  const [month, setMonth] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<string | null>(null);

  const period =
    view === "YTD" ? "YTD" : view === "Quarter" ? quarter ?? "YTD" : month ?? "YTD";

  return {
    view,
    period,
    label: periodLabel(period),
    month,
    quarter,
    setView,
    setMonth,
    setQuarter,
  };
}

/**
 * Whether a row stating `rowPeriod` (e.g. "FY26 Apr") belongs in the scope.
 * Year-to-date keeps every stated month; a quarter keeps its three months.
 */
export function periodInScope(rowPeriod: string, scope: PeriodScope): boolean {
  if (scope.period === "YTD") return true;
  if (/^Q[1-4]$/.test(scope.period)) return quarterOfPeriod(rowPeriod) === scope.period;
  return rowPeriod === scope.period;
}

const MONTH_ORDER = Object.keys(MONTH_NAMES);

/**
 * Month and quarter options a set of row periods actually states, in fiscal
 * order. Rows whose period is not a recognizable month (e.g. a quarter subtotal)
 * are left out of the month list rather than guessed at.
 */
export function periodOptionsFrom(rowPeriods: string[]): {
  months: string[];
  quarters: string[];
} {
  const months = [...new Set(rowPeriods.filter((p) => MONTH_ORDER.includes(p.slice(-3))))];
  months.sort((a, b) => {
    const fy = a.slice(0, -3).localeCompare(b.slice(0, -3));
    return fy !== 0 ? fy : MONTH_ORDER.indexOf(a.slice(-3)) - MONTH_ORDER.indexOf(b.slice(-3));
  });
  const quarters = [...new Set(months.map((m) => quarterOfPeriod(m)).filter((q): q is string => q != null))];
  quarters.sort();
  return { months, quarters };
}

export function PeriodScopeSelector({
  scope,
  monthOptions,
  quarterOptions,
  right,
}: {
  scope: PeriodScope;
  monthOptions: string[];
  quarterOptions: string[];
  /** Optional right-hand summary (e.g. the scoped total). */
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] uppercase tracking-wider text-muted-foreground">
            View
          </span>
          <div className="inline-flex rounded border border-border bg-card p-0.5">
            {PERIOD_VIEWS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  scope.setView(m);
                  // First entry into Month/Quarter lands on the latest stated
                  // period rather than an empty selection.
                  if (m === "Month" && !scope.month && monthOptions.length > 0) {
                    scope.setMonth(monthOptions[monthOptions.length - 1]);
                  }
                  if (m === "Quarter" && !scope.quarter && quarterOptions.length > 0) {
                    scope.setQuarter(quarterOptions[quarterOptions.length - 1]);
                  }
                }}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  scope.view === m
                    ? "bg-gda-green/15 text-gda-green"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {scope.view === "Month" && (
          <select
            aria-label="Month"
            value={scope.month ?? ""}
            onChange={(e) => scope.setMonth(e.target.value)}
            className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
          >
            {monthOptions.length === 0 && <option value="">No months</option>}
            {monthOptions.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        )}

        {scope.view === "Quarter" && (
          <select
            aria-label="Quarter"
            value={scope.quarter ?? ""}
            onChange={(e) => scope.setQuarter(e.target.value)}
            className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
          >
            {quarterOptions.length === 0 && <option value="">No quarters</option>}
            {quarterOptions.map((q) => (
              <option key={q} value={q}>
                {periodLabel(q)}
              </option>
            ))}
          </select>
        )}
      </div>
      {right}
    </div>
  );
}
