"use client";

/**
 * Revenue Summary by Cost Pool — the official Finance book presented as an
 * executive view: a filterable chart on top, the book's roll-up KPIs, the
 * direct/indirect pool composition, indirect actual-vs-target, and the
 * per-contract detail table.
 *
 * Every figure comes from the ingested book (`project_revenue_actuals`, source
 * `proj_revenue`); quarter and YTD are summed from the official monthly sheets
 * by the API. A pool the book did not state renders "—", never $0 — so a gap in
 * the source can never read as a real zero. Filtering happens server-side, so
 * the KPIs, chart and table always describe the same scope.
 */

import { useMemo, useState } from "react";
import { useCostPoolSummary } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";
import { cn } from "@/lib/utils";
import type {
  CostPoolField,
  CostPoolFigures,
  CostPoolProjectRow,
} from "@/lib/types";

/* ── Labels ───────────────────────────────────────────────────── */

/** Book column headers, so a figure on screen is traceable to the source. */
const POOL_LABELS: Record<CostPoolField, string> = {
  dc_dl_offsite: "DL — Contractor Offsite",
  dc_dl_onsite: "DL — Client Onsite",
  dc_direct_travel: "Direct Travel",
  dc_subk_labor: "Subcontract Labor",
  dc_subk_travel: "Subcontract Travel",
  dc_subk_material: "Subcontract Material",
  dc_consultant_labor: "Consultant Labor",
  dc_consultant_travel: "Consultant Travel",
  dc_direct_material: "Direct Material",
  dc_direct_odc: "Direct ODC",
  ind_oh_offsite: "Overhead — Contractor Offsite",
  ind_oh_onsite: "Overhead — Client Onsite",
  ind_mhx: "Material Handling (MHx)",
  ind_gna: "G&A",
};

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
function shortPeriod(p: string): string {
  return p === "YTD" || /^Q[1-4]$/.test(p) ? p : p.slice(-3);
}

/* ── Chart / metric selection ─────────────────────────────────── */

type ChartMode = "trend" | "composition" | "contracts";
const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: "trend", label: "Monthly Trend" },
  { id: "composition", label: "Cost Pool Composition" },
  { id: "contracts", label: "By Contract" },
];

type MetricKey =
  | "revenue"
  | "direct_cost"
  | "gross_profit"
  | "indirect_cost"
  | "profit";
const METRICS: { id: MetricKey; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "direct_cost", label: "Total Direct Cost" },
  { id: "gross_profit", label: "Gross Profit" },
  { id: "indirect_cost", label: "Total Indirect (Actual)" },
  { id: "profit", label: "Operating Income" },
];

// The trend chart already stacks direct and indirect cost as bars, so offering
// either as the overlaid line would draw the same figure twice under a shared
// legend entry (one legend click would hide both). The line only offers metrics
// the stack does not already show.
const STACKED_METRICS: ReadonlySet<MetricKey> = new Set([
  "direct_cost",
  "indirect_cost",
]);
const TREND_METRICS = METRICS.filter((m) => !STACKED_METRICS.has(m.id));

function metricLabelOf(id: MetricKey): string {
  return METRICS.find((m) => m.id === id)?.label ?? "Revenue";
}

type ViewMode = "Month" | "Quarter" | "YTD";
const VIEW_MODES: ViewMode[] = ["Month", "Quarter", "YTD"];

const SORT_COLS: ColumnSortConfig[] = [
  { field: "project_name", type: "string" },
  { field: "contract_number", type: "string" },
  { field: "contract_label", type: "string" },
  { field: "prime_or_sub", type: "string" },
  { field: "proj_type", type: "string" },
  { field: "revenue", type: "number" },
  { field: "direct_cost", type: "number" },
  { field: "gross_profit", type: "number" },
  { field: "indirect_cost", type: "number" },
  { field: "profit", type: "number" },
  { field: "margin_pct", type: "number" },
  { field: "rate_variance", type: "number" },
];

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

/* ── Filter select ────────────────────────────────────────────── */

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CostPoolTab({
  projectFilter = [],
}: {
  projectFilter?: string[];
}) {
  const [view, setView] = useState<ViewMode>("YTD");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("trend");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [contractLabel, setContractLabel] = useState("");
  const [primeOrSub, setPrimeOrSub] = useState("");
  const [projType, setProjType] = useState("");
  const [division, setDivision] = useState("");

  const selectedPeriod =
    view === "YTD"
      ? "YTD"
      : view === "Quarter"
        ? selectedQuarter ?? "YTD"
        : selectedMonth ?? "YTD";

  const { data, isLoading } = useCostPoolSummary(selectedPeriod, projectFilter, {
    contract_label: contractLabel,
    prime_or_sub: primeOrSub,
    proj_type: projType,
    division,
  });

  const { sortBy, sortDir, handleSort } = useTableSort("costpool");

  const rows: CostPoolProjectRow[] = useMemo(() => data?.rows ?? [], [data]);
  const totals: CostPoolFigures | null = data?.totals ?? null;
  const series = data?.by_period ?? [];
  const directPools = data?.pools.direct ?? [];
  const indirectPools = data?.pools.indirect ?? [];
  const monthOptions = data?.available_months ?? [];
  const quarterOptions = data?.available_quarters ?? [];

  const switchView = (m: ViewMode) => {
    setView(m);
    if (m === "Month" && !selectedMonth && monthOptions.length > 0) {
      setSelectedMonth(monthOptions[monthOptions.length - 1]);
    }
    if (m === "Quarter" && !selectedQuarter && quarterOptions.length > 0) {
      setSelectedQuarter(quarterOptions[quarterOptions.length - 1]);
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    return sortData(
      rows as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      SORT_COLS,
    ) as unknown as CostPoolProjectRow[];
  }, [rows, sortBy, sortDir]);

  // Keeps the By-Contract selection intact when the user flips to the trend.
  const trendMetric: MetricKey = STACKED_METRICS.has(metric) ? "revenue" : metric;

  const filtersActive =
    !!contractLabel || !!primeOrSub || !!projType || !!division;
  const anyFilterActive = filtersActive || projectFilter.length > 0;

  /* ── Chart options ──────────────────────────────────────────── */

  const axisMoney = {
    axisLabel: {
      color: "var(--color-fin-stone)",
      fontSize: 12,
      formatter: (v: number) => formatMoney(v),
    },
    splitLine: {
      lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const },
    },
  };

  // Monthly trend: the selected metric per month, with the direct/indirect
  // split stacked behind it so cost composition and revenue read together.
  const trendOption = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (
        params: Array<{ axisValue: string; seriesName: string; value: number | null; marker: string }>,
      ) =>
        [
          `<strong>${params[0]?.axisValue ?? ""}</strong>`,
          ...params.map(
            (p) =>
              `${p.marker} ${p.seriesName}: ${p.value == null ? "—" : formatMoneyFull(p.value)}`,
          ),
        ].join("<br/>"),
    },
    legend: {
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 12 },
    },
    grid: { left: 8, right: 16, top: 16, bottom: 48, containLabel: true },
    xAxis: {
      type: "category" as const,
      data: series.map((p) => shortPeriod(p.period)),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    yAxis: { type: "value" as const, ...axisMoney },
    series: [
      {
        name: "Total Direct Cost",
        type: "bar" as const,
        stack: "cost",
        // A month the book left unstated stays null, so ECharts draws a gap
        // rather than a bar sitting at zero.
        data: series.map((p) => p.direct_cost),
        itemStyle: { color: "var(--color-fin-chart-navy)" },
      },
      {
        name: "Total Indirect (Actual)",
        type: "bar" as const,
        stack: "cost",
        data: series.map((p) => p.indirect_cost),
        itemStyle: { color: "var(--color-fin-chart-orange)" },
      },
      {
        name: metricLabelOf(trendMetric),
        type: "line" as const,
        smooth: false,
        symbolSize: 6,
        data: series.map((p) => p[trendMetric]),
        itemStyle: { color: "var(--color-fin-teal)" },
        lineStyle: { color: "var(--color-fin-teal)", width: 2 },
      },
    ],
  };

  // Composition: every pool the book states for the selected scope, direct and
  // indirect distinguished by color. Pools with no stated value are omitted
  // rather than drawn as zero-length bars.
  const compositionEntries: Array<{ field: CostPoolField; value: number }> = [
    ...directPools.map((f) => ({ field: f, kind: "direct" as const })),
    ...indirectPools.map((f) => ({ field: f, kind: "indirect" as const })),
  ]
    .map(({ field }) => ({ field, value: totals ? totals[field] : null }))
    .filter((e): e is { field: CostPoolField; value: number } => e.value != null)
    .sort((a, b) => b.value - a.value);

  const compositionTotal = compositionEntries.reduce((s, e) => s + e.value, 0);
  const compositionOption = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params
          .map(
            (p) =>
              `${p.marker} ${p.name}: ${formatMoneyFull(p.value)}${
                compositionTotal
                  ? ` (${((p.value / compositionTotal) * 100).toFixed(1)}% of cost)`
                  : ""
              }`,
          )
          .join("<br/>"),
    },
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value" as const, ...axisMoney },
    yAxis: {
      type: "category" as const,
      inverse: true,
      data: compositionEntries.map((e) => POOL_LABELS[e.field]),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: compositionEntries.map((e) => ({
          value: e.value,
          itemStyle: {
            color: e.field.startsWith("ind_")
              ? "var(--color-fin-chart-orange)"
              : "var(--color-fin-chart-navy)",
          },
        })),
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

  // By contract: the selected metric per contract, largest first.
  const metricLabel = metricLabelOf(metric);
  const contractEntries = rows
    .map((r) => ({ name: r.project_name, value: r[metric] }))
    .filter((e): e is { name: string; value: number } => e.value != null)
    .sort((a, b) => b.value - a.value);

  const contractsOption = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params
          .map((p) => `${p.marker} ${p.name}: ${formatMoneyFull(p.value)}`)
          .join("<br/>"),
    },
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value" as const, ...axisMoney },
    yAxis: {
      type: "category" as const,
      inverse: true,
      data: contractEntries.map((e) =>
        e.name.length > 30 ? `${e.name.slice(0, 28)}…` : e.name,
      ),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: contractEntries.map((e) => ({
          value: e.value,
          itemStyle: {
            color:
              e.value < 0
                ? "var(--color-fin-chart-red)"
                : "var(--color-fin-chart-navy)",
          },
        })),
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

  const chart =
    chartMode === "trend"
      ? { option: trendOption, height: 320, empty: series.length === 0 }
      : chartMode === "composition"
        ? {
            option: compositionOption,
            height: Math.max(200, compositionEntries.length * 26),
            empty: compositionEntries.length === 0,
          }
        : {
            option: contractsOption,
            height: Math.max(200, contractEntries.length * 24),
            empty: contractEntries.length === 0,
          };

  const chartCaption =
    chartMode === "trend"
      ? `Monthly cost composition with ${metricLabelOf(trendMetric)} — every month the book states for this scope`
      : chartMode === "composition"
        ? `Cost pools — ${periodLabel(data?.selected_period ?? selectedPeriod)}`
        : `${metricLabel} by contract — ${periodLabel(data?.selected_period ?? selectedPeriod)}`;

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Controls: period scope, chart mode, metric, attribute filters */}
      <div className="space-y-3">
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
                {quarterOptions.length === 0 && (
                  <option value="">No quarters</option>
                )}
                {quarterOptions.map((q) => (
                  <option key={q} value={q}>
                    {periodLabel(q)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-sm font-medium text-foreground">
            {periodLabel(data?.selected_period ?? selectedPeriod)}
            {" — "}
            {formatMoneyFull(totals?.revenue ?? null)} revenue
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="inline-flex rounded border border-border bg-card p-0.5">
            {CHART_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setChartMode(m.id)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  chartMode === m.id
                    ? "bg-gda-green/15 text-gda-green"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {chartMode !== "composition" && (
            <label className="flex items-center gap-1.5">
              <span className="text-[12px] uppercase tracking-wider text-muted-foreground">
                Metric
              </span>
              <select
                aria-label="Metric"
                value={chartMode === "trend" ? trendMetric : metric}
                onChange={(e) => setMetric(e.target.value as MetricKey)}
                className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
              >
                {(chartMode === "trend" ? TREND_METRICS : METRICS).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <FilterSelect
            label="Contract"
            value={contractLabel}
            options={data?.filters.contract_labels ?? []}
            onChange={setContractLabel}
          />
          <FilterSelect
            label="Prime/Sub"
            value={primeOrSub}
            options={data?.filters.prime_or_subs ?? []}
            onChange={setPrimeOrSub}
          />
          <FilterSelect
            label="Type"
            value={projType}
            options={data?.filters.proj_types ?? []}
            onChange={setProjType}
          />
          <FilterSelect
            label="Division"
            value={division}
            options={data?.filters.divisions ?? []}
            onChange={setDivision}
          />

          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setContractLabel("");
                setPrimeOrSub("");
                setProjType("");
                setDivision("");
              }}
              className="text-xs text-gda-cyan hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {anyFilterActive && (
          <p className="text-[12px] text-muted-foreground">
            Filtered scope — every figure below, including the chart, reflects
            the {rows.length} contract{rows.length === 1 ? "" : "s"} in scope.
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="h-72 animate-pulse rounded bg-gda-skeleton" />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No cost-pool rows for{" "}
          {periodLabel(data?.selected_period ?? selectedPeriod)}
          {anyFilterActive ? " with the selected filters" : ""}. Upload a
          “Revenue Summary by Cost Pool” book to the Vault to
          populate this view.
        </p>
      ) : (
        <>
          {/* Chart on top */}
          <div className="rounded border border-border bg-card p-4">
            <p className="mb-2 text-[12px] uppercase tracking-wider text-muted-foreground">
              {chartCaption}
            </p>
            {chart.empty ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                The book states no values for this selection.
              </p>
            ) : (
              <ReactEChartsCore
                echarts={echarts}
                option={chart.option}
                style={{ height: chart.height }}
                notMerge
              />
            )}
          </div>

          {/* Book roll-ups */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi
              label="Revenue"
              value={formatMoney(totals?.revenue ?? null)}
              subtitle={`${rows.length} contract${rows.length === 1 ? "" : "s"}`}
            />
            <Kpi
              label="Total Direct Cost"
              value={formatMoney(totals?.direct_cost ?? null)}
            />
            <Kpi
              label="Gross Profit"
              value={formatMoney(totals?.gross_profit ?? null)}
              subtitle={pct(totals?.gross_profit_pct ?? null)}
            />
            <Kpi
              label="Total Indirect"
              value={formatMoney(totals?.indirect_cost ?? null)}
              subtitle="actual"
            />
            <Kpi
              label="Operating Income"
              value={formatMoney(totals?.profit ?? null)}
            />
            <Kpi
              label="Operating Margin"
              value={pct(totals?.margin_pct ?? null)}
              subtitle="on summed dollars"
            />
          </div>

          {/* Pool breakdown + indirect actual vs target */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded border border-border bg-card p-4 lg:col-span-2">
              <p className="mb-3 text-[12px] uppercase tracking-wider text-muted-foreground">
                Cost pools —{" "}
                {periodLabel(data?.selected_period ?? selectedPeriod)}
              </p>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[12px] font-medium text-foreground">
                    Direct
                  </p>
                  {directPools.map((f) => (
                    <div
                      key={f}
                      className="flex items-baseline justify-between gap-3 border-b border-border py-1"
                    >
                      <span className="text-xs text-muted-foreground">
                        {POOL_LABELS[f]}
                      </span>
                      <span className="text-xs tabular-nums text-foreground">
                        {formatMoneyFull(totals ? totals[f] : null)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-xs font-medium text-foreground">
                      Total Direct Cost
                    </span>
                    <span className="text-xs font-medium tabular-nums text-foreground">
                      {formatMoneyFull(totals?.direct_cost ?? null)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[12px] font-medium text-foreground">
                    Indirect
                  </p>
                  {indirectPools.map((f) => (
                    <div
                      key={f}
                      className="flex items-baseline justify-between gap-3 border-b border-border py-1"
                    >
                      <span className="text-xs text-muted-foreground">
                        {POOL_LABELS[f]}
                      </span>
                      <span className="text-xs tabular-nums text-foreground">
                        {formatMoneyFull(totals ? totals[f] : null)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-xs font-medium text-foreground">
                      Total Indirect (Actual)
                    </span>
                    <span className="text-xs font-medium tabular-nums text-foreground">
                      {formatMoneyFull(totals?.indirect_cost ?? null)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded border border-border bg-card p-4">
              <p className="mb-3 text-[12px] uppercase tracking-wider text-muted-foreground">
                Indirect — actual vs target
              </p>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 border-b border-border py-1">
                  <span className="text-xs text-muted-foreground">
                    Total Indirect — Actual
                  </span>
                  <span className="text-xs tabular-nums text-foreground">
                    {formatMoneyFull(totals?.indirect_cost ?? null)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-border py-1">
                  <span className="text-xs text-muted-foreground">
                    Total Indirect — Target
                  </span>
                  <span className="text-xs tabular-nums text-foreground">
                    {formatMoneyFull(totals?.total_indirect_tgt ?? null)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-xs font-medium text-foreground">
                    Rate Variance
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      totals?.rate_variance == null
                        ? "text-foreground"
                        : totals.rate_variance > 0
                          ? "text-gda-red"
                          : "text-gda-green",
                    )}
                  >
                    {formatMoneyFull(totals?.rate_variance ?? null)}
                  </span>
                </div>
                <p className="pt-2 text-[12px] text-muted-foreground">
                  Positive variance means actual indirect ran above the
                  provisional-rate target for the scope shown.
                </p>
              </div>
            </div>
          </div>

          {/* Per-contract detail */}
          <div className="max-h-[520px] overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
                  <SortableHeader label="Contract" field="project_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Proj ID" field="contract_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Vehicle" field="contract_label" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Prime/Sub" field="prime_or_sub" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Type" field="proj_type" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Revenue" field="revenue" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Direct" field="direct_cost" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Gross Profit" field="gross_profit" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Indirect" field="indirect_cost" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Op Income" field="profit" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Op Margin" field="margin_pct" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Rate Var" field="rate_variance" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.project_id ?? r.contract_number ?? r.project_name}
                    className="border-b border-border hover:bg-gda-panel/50"
                  >
                    <td className="px-3 py-2 text-left text-foreground">{r.project_name}</td>
                    <td className="px-3 py-2 text-left text-muted-foreground">{r.project_id ?? r.contract_number ?? "—"}</td>
                    <td className="px-3 py-2 text-left text-muted-foreground">{r.contract_label ?? "—"}</td>
                    <td className="px-3 py-2 text-left text-muted-foreground">{r.prime_or_sub ?? "—"}</td>
                    <td className="px-3 py-2 text-left text-muted-foreground">{r.proj_type ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(r.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(r.direct_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(r.gross_profit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(r.indirect_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(r.profit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pct(r.margin_pct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMoneyFull(r.rate_variance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="border-t border-border bg-gda-bg-base font-medium">
                  <td className="px-3 py-2 text-left text-foreground" colSpan={5}>
                    Total — {periodLabel(data?.selected_period ?? selectedPeriod)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(totals?.revenue ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(totals?.direct_cost ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(totals?.gross_profit ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(totals?.indirect_cost ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(totals?.profit ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pct(totals?.margin_pct ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMoneyFull(totals?.rate_variance ?? null)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <FinSourceStrip
            table={data?.meta.table ?? "project_revenue_actuals"}
            rowCount={data?.meta.row_count ?? 0}
            period={periodLabel(data?.selected_period ?? selectedPeriod)}
            note={`${data?.meta.source ?? "Revenue Summary by Cost Pool"}${
              totals && totals.source_doc_ids.length > 0
                ? ` · vault doc ${totals.source_doc_ids.map((id) => `#${id}`).join(", ")}`
                : ""
            } · quarter/YTD summed from the official monthly sheets · "—" means the book states no value (not $0)`}
          />
        </>
      )}
    </div>
  );
}
