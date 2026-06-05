"use client";

import { useFinancialsTrend } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

// Pure CSS spark-line trend chart — no external charting library

interface TrendPoint {
  period: string;
  orders: number;
  sales: number;
  ebit: number;
  gross_margin: number;
  ros: number;
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

export function TrendChart() {
  const { data, isLoading } = useFinancialsTrend();

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  const items: TrendPoint[] = data?.items ?? [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No trend data yet</p>;
  }

  const maxOrders = Math.max(...items.map((i) => i.orders), 1);
  const maxSales  = Math.max(...items.map((i) => i.sales), 1);
  const maxEbit   = Math.max(...items.map((i) => Math.abs(i.ebit)), 1);

  const metrics = [
    {
      label: "Orders",
      values: items.map((i) => i.orders),
      max: maxOrders,
      color: "#22d3ee",
      textClass: "text-gda-cyan",
      format: formatMoney,
    },
    {
      label: "Sales",
      values: items.map((i) => i.sales),
      max: maxSales,
      color: "#4ade80",
      textClass: "text-gda-green",
      format: formatMoney,
    },
    {
      label: "EBIT",
      values: items.map((i) => i.ebit),
      max: maxEbit,
      color: "#f59e0b",
      textClass: "text-amber-400",
      format: formatMoney,
    },
  ];

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
              <p className={cn("font-mono text-base font-bold", m.textClass)}>
                {m.format(latest)}
              </p>
              <div className={cn("text-[11px] font-mono", delta >= 0 ? "text-gda-green" : "text-red-400")}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs prior period
              </div>
              <SparkLine points={m.values} max={m.max} color={m.color} />
            </div>
          );
        })}
      </div>

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
            {items.map((item) => (
              <tr key={item.period} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left font-mono text-foreground">{item.period}</td>
                <td className="px-3 py-2 text-left text-gda-cyan">{formatMoney(item.orders)}</td>
                <td className="px-3 py-2 text-left text-gda-green">{formatMoney(item.sales)}</td>
                <td className={cn("px-3 py-2 text-left", item.ebit >= 0 ? "text-amber-400" : "text-red-400")}>
                  {formatMoney(item.ebit)}
                </td>
                <td className="px-3 py-2 text-left text-foreground font-mono">
                  {(item.gross_margin * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-left text-foreground font-mono">
                  {(item.ros * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
