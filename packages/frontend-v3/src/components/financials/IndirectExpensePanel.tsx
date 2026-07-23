"use client";

import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useIndirectExpensesTrend } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const INDIRECT_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "pool", type: "string" },
  { field: "period_actual", type: "number" },
  { field: "period_budget", type: "number" },
];

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const POOL_COLORS: Record<string, string> = {
  Fringe: "var(--color-fin-teal)",
  OH: "var(--color-fin-stone)",
  "G&A": "var(--color-fin-plum)",
};

const FALLBACK_COLOR = "var(--color-fin-sand)";

export function IndirectExpensePanel() {
  const { data, isLoading } = useIndirectExpensesTrend();
  const { sortBy, sortDir, handleSort } = useTableSort("indirect");

  const items = useMemo(() => {
    const raw = data?.items ?? [];
    if (sortBy) {
      return sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, INDIRECT_SORT_COLS) as unknown as typeof raw;
    }
    return raw;
  }, [data, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No indirect expense data yet. Upload SIE documents to the Vault.
      </p>
    );
  }

  const pools = Array.from(new Set(items.map((i) => i.pool)));
  const periods = Array.from(new Set(items.map((i) => i.period))).sort();

  const series = pools.map((pool) => ({
    name: pool,
    type: "bar" as const,
    data: periods.map((p) => {
      const item = items.find((i) => i.period === p && i.pool === pool);
      return item?.period_actual ?? 0;
    }),
    itemStyle: {
      color: POOL_COLORS[pool] ?? FALLBACK_COLOR,
    },
  }));

  const budgetSeries = pools.map((pool) => ({
    name: `${pool} Budget`,
    type: "bar" as const,
    data: periods.map((p) => {
      const item = items.find((i) => i.period === p && i.pool === pool);
      return item?.period_budget ?? 0;
    }),
    itemStyle: {
      color: POOL_COLORS[pool] ?? FALLBACK_COLOR,
      opacity: 0.3,
    },
  }));

  const option = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) => {
        const lines = params
          .filter((p) => p.value !== 0)
          .map((p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`);
        return lines.join("<br/>");
      },
    },
    legend: {
      data: pools,
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 12 },
    },
    grid: {
      left: 60,
      right: 16,
      top: 8,
      bottom: 40,
    },
    xAxis: {
      type: "category" as const,
      data: periods,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: "var(--color-fin-stone)",
        fontSize: 12,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    series: [...series, ...budgetSeries],
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-white p-4">
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          style={{ height: 280 }}
          notMerge
        />
      </div>

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[12px] text-muted-foreground uppercase tracking-wider">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Pool" field="pool" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Actual" field="period_actual" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Budget" field="period_budget" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const variance = r.period_actual - r.period_budget;
              return (
                <tr
                  key={`${r.period}-${r.pool}`}
                  className="border-b border-border hover:bg-gda-panel/50"
                >
                  <td className="px-3 py-2 text-left text-foreground">
                    {r.period}
                  </td>
                  <td className="px-3 py-2 text-left text-foreground font-medium">
                    {r.pool}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground tabular-nums">
                    {formatMoney(r.period_actual)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {formatMoney(r.period_budget)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      variance > 0
                        ? "text-gda-red"
                        : "text-gda-green-muted"
                    }`}
                  >
                    {formatMoney(variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
