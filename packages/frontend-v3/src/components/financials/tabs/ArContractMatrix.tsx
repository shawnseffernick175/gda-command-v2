"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import { useArByContract } from "@/hooks/use-financial-bible";
import { formatMoneyFull } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CalendarMode } from "@/lib/types";

const CALENDAR_MODE_KEY = "gda-financial-bible-calendar-mode";

function subscribeToStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getSnapshot(): CalendarMode {
  const v = localStorage.getItem(CALENDAR_MODE_KEY);
  return v === "CY" ? "CY" : "FY";
}
function getServerSnapshot(): CalendarMode {
  return "FY";
}

export function ArContractMatrix() {
  const calendarMode = useSyncExternalStore(
    subscribeToStorage,
    getSnapshot,
    getServerSnapshot,
  );
  const setCalendarMode = (mode: CalendarMode) => {
    localStorage.setItem(CALENDAR_MODE_KEY, mode);
    window.dispatchEvent(new StorageEvent("storage", { key: CALENDAR_MODE_KEY }));
  };

  const { data, isLoading } = useArByContract(calendarMode);
  const [rs3Expanded, setRs3Expanded] = useState(true);

  const activeMonths = useMemo(() => {
    if (!data) return [];
    return data.month_columns.filter(
      (m) => data.grand_total.months[m] !== 0,
    );
  }, [data]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (!data || data.contracts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No AR contract data available.
      </p>
    );
  }

  const rs3Contracts = data.contracts.filter((c) => c.is_rs3);
  const nonRs3Contracts = data.contracts.filter((c) => !c.is_rs3);

  function renderMoneyCell(val: number) {
    if (val === 0) return "—";
    return formatMoneyFull(val);
  }

  return (
    <div className="space-y-4">
      {/* CY/FY toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Receivables by Contract — {data.period_label} YTD
        </p>
        <div className="flex rounded border border-border">
          {(["FY", "CY"] as CalendarMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "px-2 py-1 text-[12px] font-medium transition-colors",
                calendarMode === mode
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setCalendarMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Matrix table */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Contract</th>
              {activeMonths.map((m) => (
                <th key={m} className="px-3 py-2 text-right font-medium">{m}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* RS3 IDIQ group header */}
            <tr
              className="border-b border-border bg-gda-panel/30 cursor-pointer hover:bg-gda-panel/50"
              onClick={() => setRs3Expanded(!rs3Expanded)}
            >
              <td className="px-3 py-2 text-left font-medium text-foreground" colSpan={1}>
                <span className="mr-1 inline-block w-3 text-muted-foreground">
                  {rs3Expanded ? "▾" : "▸"}
                </span>
                {data.rs3_subtotal.label}
              </td>
              {activeMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right font-medium text-foreground tabular-nums">
                  {renderMoneyCell(data.rs3_subtotal.months[m] ?? 0)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium text-foreground tabular-nums">
                {renderMoneyCell(data.rs3_subtotal.total)}
              </td>
            </tr>

            {/* RS3 child rows */}
            {rs3Expanded &&
              rs3Contracts.map((row) => (
                <tr key={row.contract} className="border-b border-border hover:bg-gda-panel/50">
                  <td className="pl-8 pr-3 py-2 text-left text-foreground">{row.contract}</td>
                  {activeMonths.map((m) => (
                    <td key={m} className="px-3 py-2 text-right text-foreground tabular-nums">
                      {renderMoneyCell(row.months[m] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-medium text-foreground tabular-nums">
                    {renderMoneyCell(row.total)}
                  </td>
                </tr>
              ))}

            {/* Non-RS3 contracts */}
            {nonRs3Contracts.map((row) => (
              <tr key={row.contract} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{row.contract}</td>
                {activeMonths.map((m) => (
                  <td key={m} className="px-3 py-2 text-right text-foreground tabular-nums">
                    {renderMoneyCell(row.months[m] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium text-foreground tabular-nums">
                  {renderMoneyCell(row.total)}
                </td>
              </tr>
            ))}

            {/* Grand total */}
            <tr className="border-t-2 border-border bg-gda-panel/40">
              <td className="px-3 py-2 text-left font-semibold text-foreground">TOTAL</td>
              {activeMonths.map((m) => (
                <td key={m} className="px-3 py-2 text-right font-semibold text-foreground tabular-nums">
                  {renderMoneyCell(data.grand_total.months[m] ?? 0)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold text-foreground tabular-nums">
                {renderMoneyCell(data.grand_total.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
