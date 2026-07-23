"use client";

import { Fragment, useMemo } from "react";
import { useFinancialsTrend } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const TREND_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "orders", type: "number" },
  { field: "sales", type: "number" },
  { field: "ebit", type: "number" },
  { field: "gross_margin", type: "number" },
  { field: "ros", type: "number" },
];

interface TrendPoint {
  source: string;
  period: string;
  is_quarter: boolean;
  orders: number;
  sales: number;
  ebit: number;
  gross_margin: number;
  ros: number;
}

const SOURCE_LABELS: Record<string, string> = {
  income_statement: "Income Statement",
  l1_actual: "Project Revenue",
  l1_target: "Revenue Plan",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function SparkLine({ points, max, color }: { points: number[]; max: number; color: string }) {
  if (points.length < 2 || max === 0) return null;
  const w = 100;
  const h = 40;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TrendChart({
  onPeriodClick,
}: {
  onPeriodClick?: (period: string) => void;
}) {
  const { data, isLoading } = useFinancialsTrend();
  const { sortBy, sortDir, handleSort } = useTableSort("trend");

  const { items, grouped, flatSorted } = useMemo(() => {
    const raw: TrendPoint[] = data?.items ?? [];
    const sources = Array.from(new Set(raw.map((i) => i.source)));
    const g = sources.map((s) => ({
      source: s,
      rows: raw.filter((i) => i.source === s),
    }));
    const flat = sortBy
      ? sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, TREND_SORT_COLS) as unknown as TrendPoint[]
      : null;
    return { items: raw, grouped: g, flatSorted: flat };
  }, [data, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No trend data yet</p>;
  }

  const monthRows = items.filter((i) => !i.is_quarter);
  const sparkRows = monthRows.filter((i) => i.source === "income_statement");
  const spark = sparkRows.length > 0 ? sparkRows : monthRows;

  const maxOrders = Math.max(...spark.map((i) => i.orders), 1);
  const maxSales  = Math.max(...spark.map((i) => i.sales), 1);
  const maxEbit   = Math.max(...spark.map((i) => Math.abs(i.ebit)), 1);

  const metrics = [
    {
      label: "Orders",
      values: spark.map((i) => i.orders),
      max: maxOrders,
      color: "var(--color-gda-cyan)",
      textClass: "text-gda-cyan",
      format: formatMoney,
    },
    {
      label: "Sales",
      values: spark.map((i) => i.sales),
      max: maxSales,
      color: "var(--color-gda-green-muted)",
      textClass: "text-gda-green",
      format: formatMoney,
    },
    {
      label: "EBIT",
      values: spark.map((i) => i.ebit),
      max: maxEbit,
      color: "var(--color-gda-amber)",
      textClass: "text-amber-400",
      format: formatMoney,
    },
  ];

  const clickable = !!onPeriodClick;

  return (
    <div className="space-y-4">
      {/* Sparklines */}
      <div className="grid grid-cols-3 gap-4">
        {metrics.map((m) => {
          const latest = m.values[m.values.length - 1] ?? 0;
          const prev   = m.values[m.values.length - 2] ?? 0;
          const delta  = prev !== 0 ? ((latest - prev) / prev) * 100 : 0;
          return (
            <div key={m.label} className="rounded border border-border bg-gda-panel p-3 space-y-1">
              <p className="text-[12px] text-muted-foreground">{m.label}</p>
              <p className={cn("text-base font-bold", m.textClass)}>
                {m.format(latest)}
              </p>
              <div className={cn("text-[12px]", delta >= 0 ? "text-gda-green" : "text-gda-red")}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs prior period
              </div>
              <SparkLine points={m.values} max={m.max} color={m.color} />
            </div>
          );
        })}
      </div>

      {clickable && (
        <p className="text-[12px] text-muted-foreground text-center">
          Click a row to see period details
        </p>
      )}

      {/* Full data table */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[12px] text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Orders" field="orders" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-gda-cyan" />
              <SortableHeader label="Sales" field="sales" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-gda-green" />
              <SortableHeader label="EBIT" field="ebit" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Gross Margin" field="gross_margin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Return on Sales" field="ros" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {flatSorted ? (
              flatSorted.map((item) => (
                <tr
                  key={`${item.source}-${item.period}`}
                  className={cn(
                    "border-b border-border",
                    item.is_quarter && "bg-gda-panel/40 font-bold",
                    clickable && "cursor-pointer hover:bg-gda-panel/50",
                    !clickable && "hover:bg-gda-panel/50",
                  )}
                  onClick={clickable ? () => onPeriodClick(item.period) : undefined}
                >
                  <td className="px-3 py-2 text-left text-foreground">{item.period}</td>
                  <td className="px-3 py-2 text-left text-gda-cyan">{formatMoney(item.orders)}</td>
                  <td className="px-3 py-2 text-left text-gda-green">{formatMoney(item.sales)}</td>
                  <td className={cn("px-3 py-2 text-left", item.ebit >= 0 ? "text-gda-green" : "text-gda-red")}>
                    {formatMoney(item.ebit)}
                  </td>
                  <td className="px-3 py-2 text-left text-foreground tabular-nums">
                    {item.gross_margin.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-left text-foreground tabular-nums">
                    {item.ros.toFixed(1)}%
                  </td>
                </tr>
              ))
            ) : (
              grouped.map((g) => (
                <Fragment key={g.source}>
                  <tr className="border-b border-border bg-gda-bg-base">
                    <td colSpan={6} className="px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                      {sourceLabel(g.source)}
                    </td>
                  </tr>
                  {g.rows.map((item) => (
                    <tr
                      key={`${g.source}-${item.period}`}
                      className={cn(
                        "border-b border-border",
                        item.is_quarter && "bg-gda-panel/40 font-bold",
                        clickable && "cursor-pointer hover:bg-gda-panel/50",
                        !clickable && "hover:bg-gda-panel/50",
                      )}
                      onClick={clickable ? () => onPeriodClick(item.period) : undefined}
                    >
                      <td className="px-3 py-2 text-left text-foreground">{item.period}</td>
                      <td className="px-3 py-2 text-left text-gda-cyan">{formatMoney(item.orders)}</td>
                      <td className="px-3 py-2 text-left text-gda-green">{formatMoney(item.sales)}</td>
                      <td className={cn("px-3 py-2 text-left", item.ebit >= 0 ? "text-gda-green" : "text-gda-red")}>
                        {formatMoney(item.ebit)}
                      </td>
                      <td className="px-3 py-2 text-left text-foreground tabular-nums">
                        {item.gross_margin.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-left text-foreground tabular-nums">
                        {item.ros.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
