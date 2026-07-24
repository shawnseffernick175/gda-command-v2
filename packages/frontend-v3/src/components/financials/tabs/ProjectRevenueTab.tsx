"use client";

import { useMemo, useState } from "react";
import { useProjectRevenue } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";
import { cn } from "@/lib/utils";

const PR_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "project_name", type: "string" },
  { field: "contract_number", type: "string" },
  { field: "revenue", type: "number" },
  { field: "cost", type: "number" },
  { field: "profit", type: "number" },
  { field: "margin_pct", type: "number" },
];

const MONTH_NAMES: Record<string, string> = {
  Jan: "January", Feb: "February", Mar: "March", Apr: "April",
  May: "May", Jun: "June", Jul: "July", Aug: "August",
  Sep: "September", Oct: "October", Nov: "November", Dec: "December",
};

const QUARTER_MONTHS: Record<string, string> = {
  Q1: "Jan–Mar", Q2: "Apr–Jun", Q3: "Jul–Sep", Q4: "Oct–Dec",
};

function periodLabel(p: string): string {
  if (p === "YTD") return "YTD";
  if (/^Q[1-4]$/.test(p)) return `${p} (${QUARTER_MONTHS[p]})`;
  return MONTH_NAMES[p.slice(-3)] ?? p;
}

type ViewMode = "Month" | "Quarter" | "YTD";
const VIEW_MODES: ViewMode[] = ["Month", "Quarter", "YTD"];

export function ProjectRevenueTab() {
  // View selector: Month = a chosen month, Quarter = that calendar quarter's
  // roll-up, YTD = cumulative through the year. The backend derives quarter/YTD
  // by summing the official monthly rows — never fabricating absent months.
  const [view, setView] = useState<ViewMode>("YTD");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);

  const selectedPeriod =
    view === "YTD"
      ? "YTD"
      : view === "Quarter"
        ? selectedQuarter ?? "YTD"
        : selectedMonth ?? "YTD";

  const { data, isLoading } = useProjectRevenue(selectedPeriod);
  const { sortBy, sortDir, handleSort } = useTableSort("projrev");

  const items = useMemo(() => data?.items ?? [], [data]);
  const monthOptions = useMemo(() => data?.available_months ?? [], [data]);
  const quarterOptions = useMemo(() => data?.available_quarters ?? [], [data]);

  // Switch views and, on first entry into Month/Quarter, default the
  // sub-selection to the latest available period. Setting state in the click
  // handler (not an effect) keeps the table and selector in sync in one pass.
  const switchView = (m: ViewMode) => {
    setView(m);
    if (m === "Month" && !selectedMonth && monthOptions.length > 0) {
      setSelectedMonth(monthOptions[monthOptions.length - 1]);
    }
    if (m === "Quarter" && !selectedQuarter && quarterOptions.length > 0) {
      setSelectedQuarter(quarterOptions[quarterOptions.length - 1]);
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortBy) return items;
    return sortData(
      items as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      PR_SORT_COLS,
    ) as unknown as typeof items;
  }, [items, sortBy, sortDir]);

  const totalRevenue = items.reduce((s, r) => s + r.revenue, 0);
  const totalCost = items.reduce((s, r) => s + r.cost, 0);
  const totalProfit = items.reduce((s, r) => s + r.profit, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const headerTotal = data?.meta?.period_total ?? totalRevenue;

  // All projects by revenue (retain every project — no top-N truncation)
  const ranked = [...items].sort((a, b) => b.revenue - a.revenue);

  const sourceStripPeriod = periodLabel(selectedPeriod);

  const periodSelector = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] uppercase tracking-wider text-muted-foreground">
            View
          </span>
          <div className="inline-flex rounded border border-border bg-card p-0.5">
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchView(m)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  view === m
                    ? "bg-gda-green/15 text-gda-green"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {view === "Month" && (
          <select
            aria-label="Month"
            value={selectedMonth ?? ""}
            onChange={(e) => setSelectedMonth(e.target.value)}
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

        {view === "Quarter" && (
          <select
            aria-label="Quarter"
            value={selectedQuarter ?? ""}
            onChange={(e) => setSelectedQuarter(e.target.value)}
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
      <p className="text-sm font-medium text-foreground">
        {periodLabel(data?.selected_period ?? selectedPeriod)} —{" "}
        {formatMoneyFull(headerTotal)}
      </p>
    </div>
  );

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
      {periodSelector}

      {isLoading ? (
        <div className="h-48 animate-pulse rounded bg-gda-skeleton" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No project revenue rows for {periodLabel(selectedPeriod)}. Select
          another period, or upload a Revenue Summary by Cost Pool book to
          populate.
        </p>
      ) : (
        <>
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
        period={sourceStripPeriod}
        note="contract-type / Gov-vs-Commercial split not in ingest — see Income Statement"
      />
        </>
      )}
    </div>
  );
}
