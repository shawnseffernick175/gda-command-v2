"use client";

import { useMemo } from "react";
import { useProjectRevenue } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";

const PR_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "project_name", type: "string" },
  { field: "contract_number", type: "string" },
  { field: "revenue", type: "number" },
  { field: "cost", type: "number" },
  { field: "profit", type: "number" },
  { field: "margin_pct", type: "number" },
];

export function ProjectRevenueTab() {
  const { data, isLoading } = useProjectRevenue();
  const { sortBy, sortDir, handleSort } = useTableSort("projrev");

  const items = useMemo(() => data?.items ?? [], [data]);

  const sortedItems = useMemo(() => {
    if (!sortBy) return items;
    return sortData(
      items as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      PR_SORT_COLS,
    ) as unknown as typeof items;
  }, [items, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Project revenue data not yet ingested. Upload a Full Proj Revenue
        Summary to populate.
      </p>
    );
  }

  const totalRevenue = items.reduce((s, r) => s + r.revenue, 0);
  const totalCost = items.reduce((s, r) => s + r.cost, 0);
  const totalProfit = items.reduce((s, r) => s + r.profit, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const top5 = [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const chartOption = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) =>
        params.map((p) => `${p.marker} ${p.seriesName}: ${formatMoneyFull(p.value)}`).join("<br/>"),
    },
    legend: {
      data: ["Revenue", "Cost", "Profit"],
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    grid: { left: 60, right: 16, top: 32, bottom: 48 },
    xAxis: {
      type: "category" as const,
      data: top5.map((r) => r.project_name.length > 18 ? r.project_name.slice(0, 16) + "…" : r.project_name),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 10, rotate: 15 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: "var(--color-fin-stone)",
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    series: [
      {
        name: "Revenue",
        type: "bar" as const,
        data: top5.map((r) => r.revenue),
        itemStyle: { color: "var(--color-gda-green)" },
      },
      {
        name: "Cost",
        type: "bar" as const,
        data: top5.map((r) => r.cost),
        itemStyle: { color: "var(--color-fin-amber)" },
      },
      {
        name: "Profit",
        type: "bar" as const,
        data: top5.map((r) => r.profit),
        itemStyle: { color: "var(--color-fin-navy)" },
      },
    ],
  };

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total Revenue" value={formatMoney(totalRevenue)} subtitle={`${items.length} projects`} />
        <Kpi label="Total Cost" value={formatMoney(totalCost)} />
        <Kpi label="Total Profit" value={formatMoney(totalProfit)} />
        <Kpi label="Avg Margin" value={`${avgMargin.toFixed(1)}%`} />
      </div>

      {/* Chart */}
      <div className="rounded border border-border bg-white p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Top 5 Projects by Revenue
        </p>
        <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 260 }} notMerge />
      </div>

      {/* Table with sticky header + sortable columns */}
      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Project" field="project_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Contract #" field="contract_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Revenue" field="revenue" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Cost" field="cost" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Profit" field="profit" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Margin %" field="margin_pct" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((r) => (
              <tr key={r.id} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{r.period}</td>
                <td className="px-3 py-2 text-left text-foreground">{r.project_name}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.contract_number ?? "—"}</td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">{formatMoneyFull(r.revenue)}</td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">{formatMoneyFull(r.cost)}</td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">{formatMoneyFull(r.profit)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                  {r.margin_pct != null ? `${r.margin_pct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
