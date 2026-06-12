"use client";

import { Fragment } from "react";
import { useFinancialsTrend } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

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
  l1_actual: "Project Revenue (L1-ACTUAL)",
  l1_target: "Plan (L1-TARGET)",
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

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  const items: TrendPoint[] = data?.items ?? [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No trend data yet</p>;
  }

  const monthRows = items.filter((i) => !i.is_quarter);
  const sparkRows = monthRows.filter((i) => i.source === "income_statement");
  const spark = sparkRows.length > 0 ? sparkRows : monthRows;

  const sources = Array.from(new Set(items.map((i) => i.source)));
  const grouped = sources.map((s) => ({
    source: s,
    rows: items.filter((i) => i.source === s),
  }));

  const maxOrders = Math.max(...spark.map((i) => i.orders), 1);
  const maxSales  = Math.max(...spark.map((i) => i.sales), 1);
  const maxEbit   = Math.max(...spark.map((i) => Math.abs(i.ebit)), 1);

  const metrics = [
    {
      label: "Orders",
      values: spark.map((i) => i.orders),
      max: maxOrders,
      color: "#22d3ee",
      textClass: "text-gda-cyan",
      format: formatMoney,
    },
    {
      label: "Sales",
      values: spark.map((i) => i.sales),
      max: maxSales,
      color: "#4ade80",
      textClass: "text-gda-green",
      format: formatMoney,
    },
    {
      label: "EBIT",
      values: spark.map((i) => i.ebit),
      max: maxEbit,
      color: "#f59e0b",
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
              <p className="text-[11px] text-muted-foreground">{m.label}</p>
              <p className={cn("text-base font-bold", m.textClass)}>
                {m.format(latest)}
              </p>
              <div className={cn("text-[11px]", delta >= 0 ? "text-gda-green" : "text-red-400")}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs prior period
              </div>
              <SparkLine points={m.values} max={m.max} color={m.color} />
            </div>
          );
        })}
      </div>

      {clickable && (
        <p className="text-[11px] text-muted-foreground text-center">
          Click a row to see period details
        </p>
      )}

      {/* Full data table */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-left font-medium text-gda-cyan">Orders</th>
              <th className="px-3 py-2 text-left font-medium text-gda-green">Sales</th>
              <th className="px-3 py-2 text-left font-medium text-amber-400">EBIT</th>
              <th className="px-3 py-2 text-left font-medium">Gross Margin</th>
              <th className="px-3 py-2 text-left font-medium">ROS</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <Fragment key={g.source}>
                <tr className="border-b border-border bg-gda-bg-base">
                  <td colSpan={6} className="px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
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
                    <td className={cn("px-3 py-2 text-left", item.ebit >= 0 ? "text-amber-400" : "text-red-400")}>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
