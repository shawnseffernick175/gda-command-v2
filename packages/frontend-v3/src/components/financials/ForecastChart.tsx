"use client";

import { useMemo } from "react";
import { useFinancialsForecast } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const FORECAST_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "plan_orders", type: "number" },
  { field: "actual_orders", type: "number" },
  { field: "plan_sales", type: "number" },
  { field: "actual_sales", type: "number" },
];

export function ForecastChart({
  onPeriodClick,
}: {
  onPeriodClick?: (period: string) => void;
}) {
  const { data, isLoading } = useFinancialsForecast();
  const { sortBy, sortDir, handleSort } = useTableSort("forecast");

  const items = useMemo(() => {
    const raw = data?.items ?? [];
    if (sortBy) {
      return sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, FORECAST_SORT_COLS) as unknown as typeof raw;
    }
    return raw;
  }, [data, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No forecast data yet</p>;
  }

  const maxVal = Math.max(
    ...items.flatMap((i) => [i.actual_orders ?? 0, i.plan_orders]),
    1,
  );

  const clickable = !!onPeriodClick;

  return (
    <div className="w-full space-y-4">
      {/* Chart area */}
      <div className="flex items-end gap-4 h-48 px-2">
        {items.map((item) => {
          const planPct   = Math.round((item.plan_orders / maxVal) * 100);
          const actualPct = item.has_actuals
            ? Math.round(((item.actual_orders ?? 0) / maxVal) * 100)
            : 0;
          return (
            <div
              key={item.period}
              className={cn(
                "flex flex-col items-center gap-1 flex-1 min-w-0 h-full justify-end",
                clickable && "cursor-pointer",
              )}
              onClick={clickable ? () => onPeriodClick(item.period) : undefined}
            >
              <div className="flex items-end gap-1 w-full justify-center h-40">
                {/* Actual */}
                <div className="relative flex flex-col justify-end w-5 h-full group">
                  {item.has_actuals ? (
                    <>
                      <div
                        className="w-full rounded-t bg-gda-cyan/80 transition-all"
                        style={{ height: `${actualPct}%` }}
                      />
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded border border-border bg-gda-panel px-1.5 py-0.5 text-[11px] text-foreground z-10">
                        Actual: {formatMoney(item.actual_orders ?? 0)}
                      </div>
                    </>
                  ) : (
                    <div className="w-full rounded-t bg-gda-panel border border-dashed border-border/40" style={{ height: "4px" }} />
                  )}
                </div>
                {/* Plan */}
                <div className="relative flex flex-col justify-end w-5 h-full group">
                  <div
                    className="w-full rounded-t bg-muted/50 border border-border/40 transition-all"
                    style={{ height: `${planPct}%` }}
                  />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded border border-border bg-gda-panel px-1.5 py-0.5 text-[11px] text-foreground z-10">
                    Plan: {formatMoney(item.plan_orders)}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground text-center leading-tight">{item.period}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gda-cyan/80" />
          <span className="text-[11px] text-muted-foreground">Actual Orders</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-muted/50 border border-border/40" />
          <span className="text-[11px] text-muted-foreground">Plan Orders</span>
        </div>
        {clickable && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            Click a bar to drill down
          </span>
        )}
      </div>

      {/* Data table */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Plan Orders" field="plan_orders" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Actual Orders" field="actual_orders" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Plan Sales" field="plan_sales" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Actual Sales" field="actual_sales" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.period}
                className={cn(
                  "border-b border-border",
                  clickable && "cursor-pointer hover:bg-gda-panel/50",
                  !clickable && "hover:bg-gda-panel/50",
                )}
                onClick={clickable ? () => onPeriodClick(item.period) : undefined}
              >
                <td className="px-3 py-2 text-left text-foreground">{item.period}</td>
                <td className="px-3 py-2 text-left text-foreground">{formatMoney(item.plan_orders)}</td>
                <td className={cn("px-3 py-2 text-left", item.has_actuals ? "text-gda-cyan" : "text-muted-foreground")}>
                  {item.has_actuals ? formatMoney(item.actual_orders ?? 0) : "—"}
                </td>
                <td className="px-3 py-2 text-left text-foreground">{formatMoney(item.plan_sales)}</td>
                <td className={cn("px-3 py-2 text-left", item.has_actuals ? "text-gda-cyan" : "text-muted-foreground")}>
                  {item.has_actuals ? formatMoney(item.actual_sales ?? 0) : "—"}
                </td>
                <td className="px-3 py-2 text-left">
                  <span className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px]",
                    item.has_actuals ? "border-gda-green/40 text-gda-green" : "border-border text-muted-foreground"
                  )}>
                    {item.has_actuals ? "actuals" : "plan only"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
