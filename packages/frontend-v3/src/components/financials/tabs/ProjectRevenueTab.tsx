"use client";

import { useMemo } from "react";
import { useProjectRevenue } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";

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
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
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

  // All projects by revenue (retain every project — no top-N truncation)
  const ranked = [...items].sort((a, b) => b.revenue - a.revenue);

  const periods = [...new Set(items.map((r) => r.period))];
  const periodLabel = periods.length === 1 ? periods[0] : `${periods.length} periods`;

  // Revenue by project — horizontal bars scale to project count without crush.
  const revByProject = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params
          .map(
            (p) =>
              `${p.marker} ${p.name}: ${formatMoneyFull(p.value)} (${
                totalRevenue ? ((p.value / totalRevenue) * 100).toFixed(1) : "0"
              }%)`,
          )
          .join("<br/>"),
    },
    grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12, formatter: (v: number) => formatMoney(v) },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    yAxis: {
      type: "category" as const,
      inverse: true,
      data: ranked.map((r) => (r.project_name.length > 28 ? r.project_name.slice(0, 26) + "…" : r.project_name)),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: ranked.map((r) => r.revenue),
        itemStyle: { color: "var(--color-fin-chart-navy)" },
        label: {
          show: true,
          position: "right" as const,
          fontSize: 12,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
    ],
  };

  // Margin by project — only projects whose margin the source actually provides.
  const withMargin = ranked.filter((r) => r.margin_pct != null);
  const marginChart = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params.map((p) => `${p.marker} ${p.name}: ${p.value.toFixed(1)}%`).join("<br/>"),
    },
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12, formatter: (v: number) => `${v}%` },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    yAxis: {
      type: "category" as const,
      inverse: true,
      data: withMargin.map((r) => (r.project_name.length > 28 ? r.project_name.slice(0, 26) + "…" : r.project_name)),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: withMargin.map((r) => ({
          value: r.margin_pct as number,
          itemStyle: {
            color:
              (r.margin_pct as number) < 0
                ? "var(--color-fin-chart-red)"
                : (r.margin_pct as number) < 8
                  ? "var(--color-fin-chart-orange)"
                  : "var(--color-fin-chart-green)",
          },
        })),
        label: {
          show: true,
          position: "right" as const,
          fontSize: 12,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
        },
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total Revenue" value={formatMoney(totalRevenue)} subtitle={`${items.length} projects`} />
        <Kpi label="Total Cost" value={formatMoney(totalCost)} />
        <Kpi label="Total Profit" value={formatMoney(totalProfit)} />
        <Kpi label="Avg Margin" value={`${avgMargin.toFixed(1)}%`} subtitle="weighted by revenue" />
      </div>

      {/* Revenue by project — all projects */}
      <div className="rounded border border-border bg-card p-4">
        <p className="mb-2 text-[12px] uppercase tracking-wider text-muted-foreground">
          Revenue by Project — all {ranked.length} projects
        </p>
        <ReactEChartsCore
          echarts={echarts}
          option={revByProject}
          style={{ height: Math.max(200, ranked.length * 22) }}
          notMerge
        />
      </div>

      {/* Margin by project */}
      {withMargin.length > 0 && (
        <div className="rounded border border-border bg-card p-4">
          <p className="mb-2 text-[12px] uppercase tracking-wider text-muted-foreground">
            {"Margin by Project (red <0% · amber <8% · green ≥8%)"}
          </p>
          <ReactEChartsCore
            echarts={echarts}
            option={marginChart}
            style={{ height: Math.max(160, withMargin.length * 22) }}
            notMerge
          />
        </div>
      )}

      {/* Table with sticky header + sortable columns */}
      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
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

      <FinSourceStrip
        table="project_revenue_actuals"
        rowCount={items.length}
        period={periodLabel}
        note="contract-type / Gov-vs-Commercial split not in ingest — see Income Statement"
      />
    </div>
  );
}
