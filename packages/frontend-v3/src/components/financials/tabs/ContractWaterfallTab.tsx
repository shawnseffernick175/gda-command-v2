"use client";

import { useState, useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  useContractWaterfall,
  useCreateTaskOrder,
} from "@/hooks/use-financial-bible";
import { formatMoney } from "@/lib/format-money";
import type { ContractWaterfallData, WaterfallContract } from "@/lib/types";

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

type ViewMode = "revenue" | "profit" | "both";
type StatusFilter = "" | "active" | "closeout" | "expired" | "awarded_not_started";
type RoleFilter = "" | "PRIME" | "SUB";

const VEHICLE_COLORS: Record<string, string> = {
  RS3: "var(--color-fin-teal)",
  TRAYSYS: "#2D6A4F",
  "Seaport NxG": "#1B4332",
  "GSA MAS": "#3D405B",
  "OASIS SB Pool 1": "#5F0F40",
  "OASIS SB Pool 3": "#6A4C93",
  eFAST: "#264653",
  EAGLE: "#2A9D8F",
  "TSS-E": "#E76F51",
  "CIO-SP3 SB": "#F4A261",
  "CIO-SP3 8(a)": "#E9C46A",
};

function getContractColor(c: WaterfallContract, idx: number): string {
  if (c.parent_vehicle_short_name && VEHICLE_COLORS[c.parent_vehicle_short_name]) {
    return VEHICLE_COLORS[c.parent_vehicle_short_name];
  }
  const palette = ["#01696F", "#2D6A4F", "#3D405B", "#5F0F40", "#6A4C93", "#264653", "#E76F51"];
  return palette[idx % palette.length];
}

export function ContractWaterfallTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [vehicleFilter, setVehicleFilter] = useState<number[]>([]);
  const [addFormOpen, setAddFormOpen] = useState(false);

  const params = useMemo(
    () => ({
      status: statusFilter || undefined,
      prime_or_sub: roleFilter || undefined,
    }),
    [statusFilter, roleFilter],
  );

  const { data, isLoading, error } = useContractWaterfall(params);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading contract waterfall…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-fin-plum">
        Failed to load waterfall: {error.message}
      </div>
    );
  }

  if (!data || data.contracts.length === 0) {
    return (
      <WaterfallEmptyState
        onAddTaskOrder={() => setAddFormOpen(true)}
        addFormOpen={addFormOpen}
        onCloseAddForm={() => setAddFormOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <WaterfallControls
        viewMode={viewMode}
        setViewMode={setViewMode}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        availableVehicles={data.available_vehicles}
        vehicleFilter={vehicleFilter}
        setVehicleFilter={setVehicleFilter}
        onAddTaskOrder={() => setAddFormOpen(true)}
      />

      <ForecastSummaryStrip data={data} />

      <WaterfallChart data={data} viewMode={viewMode} />

      <ContractTable contracts={data.contracts} portfolioMargin={data.portfolio_avg_margin} />

      {data.pipeline.length === 0 && <PipelineScaffold />}

      {addFormOpen && (
        <AddTaskOrderDrawer onClose={() => setAddFormOpen(false)} />
      )}
    </div>
  );
}

/* ── Empty State ──────────────────────────────────── */

function WaterfallEmptyState({
  onAddTaskOrder,
  addFormOpen,
  onCloseAddForm,
}: {
  onAddTaskOrder: () => void;
  addFormOpen: boolean;
  onCloseAddForm: () => void;
}) {
  return (
    <div className="rounded border border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        No signed task orders found. Add a contract to see the revenue forecast waterfall.
      </p>
      <button
        type="button"
        className="rounded bg-fin-teal px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90"
        onClick={onAddTaskOrder}
      >
        + Add Task Order
      </button>
      {addFormOpen && <AddTaskOrderDrawer onClose={onCloseAddForm} />}
    </div>
  );
}

/* ── Controls ─────────────────────────────────────── */

function WaterfallControls({
  viewMode,
  setViewMode,
  statusFilter,
  setStatusFilter,
  roleFilter,
  setRoleFilter,
  availableVehicles,
  vehicleFilter,
  setVehicleFilter,
  onAddTaskOrder,
}: {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  roleFilter: RoleFilter;
  setRoleFilter: (v: RoleFilter) => void;
  availableVehicles: { id: number; short_name: string }[];
  vehicleFilter: number[];
  setVehicleFilter: (v: number[]) => void;
  onAddTaskOrder: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* View toggle */}
      <div className="flex items-center rounded border border-border bg-card">
        {(["revenue", "profit", "both"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
              viewMode === m
                ? "bg-fin-teal text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        className="rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="awarded_not_started">Awarded</option>
        <option value="closeout">Closeout</option>
        <option value="expired">Expired</option>
      </select>

      {/* Role filter */}
      <select
        value={roleFilter}
        onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        className="rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground"
      >
        <option value="">All roles</option>
        <option value="PRIME">Prime</option>
        <option value="SUB">Sub</option>
      </select>

      {/* Vehicle filter */}
      {availableVehicles.length > 0 && (
        <select
          value={vehicleFilter.length === 1 ? String(vehicleFilter[0]) : ""}
          onChange={(e) => {
            const val = e.target.value;
            setVehicleFilter(val ? [Number(val)] : []);
          }}
          className="rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground"
        >
          <option value="">All vehicles</option>
          {availableVehicles.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.short_name}
            </option>
          ))}
        </select>
      )}

      <div className="ml-auto">
        <button
          type="button"
          className="rounded bg-fin-teal px-3 py-1 text-[11px] font-medium text-white transition-colors hover:opacity-90"
          onClick={onAddTaskOrder}
        >
          + Add TO
        </button>
      </div>
    </div>
  );
}

/* ── Summary Strip ────────────────────────────────── */

function ForecastSummaryStrip({ data }: { data: ContractWaterfallData }) {
  const totalCeiling = data.contracts.reduce((s, c) => s + c.ceiling, 0);
  const totalFunded = data.contracts.reduce((s, c) => s + c.funded_to_date, 0);
  const totalForecastRevenue = data.forecast.reduce((s, f) => s + f.total_revenue, 0);
  const totalForecastProfit = data.forecast.reduce((s, f) => s + f.total_profit, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard label="Total Ceiling" value={formatMoney(totalCeiling)} />
      <MetricCard label="Funded to Date" value={formatMoney(totalFunded)} accent />
      <MetricCard label="Forecast Revenue" value={formatMoney(totalForecastRevenue)} sub={`${data.forecast.length} months`} />
      <MetricCard label="Forecast Profit" value={formatMoney(totalForecastProfit)} sub={`${data.portfolio_avg_margin.toFixed(1)}% avg margin`} />
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`text-[16px] tabular-nums font-semibold ${accent ? "text-fin-teal" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ── ECharts Waterfall Chart ──────────────────────── */

function WaterfallChart({ data, viewMode }: { data: ContractWaterfallData; viewMode: ViewMode }) {
  const option = useMemo(() => {
    const months = data.forecast.map((f) => f.month);
    const showRevenue = viewMode === "revenue" || viewMode === "both";
    const showProfit = viewMode === "profit" || viewMode === "both";

    const series: Record<string, unknown>[] = [];

    if (showRevenue) {
      // Stacked bar series for each contract (funded + unfunded)
      for (let i = 0; i < data.contracts.length; i++) {
        const contract = data.contracts[i];
        const color = getContractColor(contract, i);

        // Funded revenue series
        series.push({
          name: `${contract.to_name} (funded)`,
          type: "bar",
          stack: "revenue",
          data: data.forecast.map((f) => {
            const entry = f.by_contract.find((bc) => bc.contract_id === contract.id);
            return entry ? entry.funded_revenue : 0;
          }),
          itemStyle: { color },
          emphasis: { focus: "series" },
        });

        // Unfunded revenue series (lighter shade)
        series.push({
          name: `${contract.to_name} (unfunded)`,
          type: "bar",
          stack: "revenue",
          data: data.forecast.map((f) => {
            const entry = f.by_contract.find((bc) => bc.contract_id === contract.id);
            return entry ? entry.unfunded_revenue : 0;
          }),
          itemStyle: {
            color,
            opacity: 0.4,
            decal: {
              symbol: "rect",
              dashArrayX: [1, 0],
              dashArrayY: [2, 5],
              rotation: Math.PI / 4,
            },
          },
          emphasis: { focus: "series" },
        });
      }
    }

    if (showProfit) {
      series.push({
        name: "Profit",
        type: "line",
        data: data.forecast.map((f) => Math.round(f.total_profit * 100) / 100),
        lineStyle: { color: "#A12C7B", width: 2 },
        itemStyle: { color: "#A12C7B" },
        symbol: "circle",
        symbolSize: 4,
        yAxisIndex: showRevenue ? 1 : 0,
      });
    }

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: { seriesName: string; value: number; axisValueLabel: string }[]) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const month = params[0].axisValueLabel;
          let html = `<div style="font-size:12px"><strong>${month}</strong>`;
          let totalRev = 0;
          let totalProf = 0;
          for (const p of params) {
            if (p.value > 0) {
              html += `<br/>${p.seriesName}: ${formatMoney(p.value)}`;
              if (p.seriesName === "Profit") {
                totalProf += p.value;
              } else {
                totalRev += p.value;
              }
            }
          }
          if (totalRev > 0) html += `<br/><strong>Total Revenue: ${formatMoney(totalRev)}</strong>`;
          if (totalProf > 0) html += `<br/><strong>Total Profit: ${formatMoney(totalProf)}</strong>`;
          html += "</div>";
          return html;
        },
      },
      legend: {
        type: "scroll",
        bottom: 0,
        textStyle: { fontSize: 10, color: "#7A7974" },
      },
      grid: {
        left: 80,
        right: showRevenue && showProfit ? 80 : 40,
        top: 40,
        bottom: 60,
      },
      xAxis: {
        type: "category",
        data: months,
        axisLabel: {
          fontSize: 10,
          color: "#7A7974",
          rotate: 45,
          formatter: (val: string) => {
            const [y, m] = val.split("-");
            return `${m}/${y.slice(2)}`;
          },
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#D4D1CA" } },
      },
      yAxis: [
        {
          type: "value",
          name: showRevenue ? "Revenue ($)" : "Profit ($)",
          nameTextStyle: { fontSize: 10, color: "#7A7974" },
          axisLabel: {
            fontSize: 10,
            color: "#7A7974",
            formatter: (val: number) => formatMoney(val),
          },
          splitLine: { lineStyle: { color: "#D4D1CA", type: "dashed" } },
        },
        ...(showRevenue && showProfit
          ? [
              {
                type: "value",
                name: "Profit ($)",
                nameTextStyle: { fontSize: 10, color: "#A12C7B" },
                axisLabel: {
                  fontSize: 10,
                  color: "#A12C7B",
                  formatter: (val: number) => formatMoney(val),
                },
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      dataZoom: [
        {
          type: "inside",
          start: 0,
          end: 100,
        },
        {
          type: "slider",
          start: 0,
          end: 100,
          height: 20,
          bottom: 30,
        },
      ],
      series,
    };
  }, [data, viewMode]);

  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue/Profit Forecast Waterfall
        </h3>
        <span className="text-[11px] text-muted-foreground">
          Spread: ceiling &divide; 12 = annual, &divide; 12 = monthly
        </span>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 380 }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}

/* ── Contract Table ───────────────────────────────── */

function ContractTable({ contracts, portfolioMargin }: { contracts: WaterfallContract[]; portfolioMargin: number }) {
  return (
    <div className="rounded border border-border bg-card overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border bg-gda-bg-deep">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Contract</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vehicle</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ceiling</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Funded</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Monthly Rev</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Annual Rev</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Margin</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">PoP</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-gda-bg-deep/50">
              <td className="px-3 py-2 font-medium text-foreground">{c.to_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.parent_vehicle_short_name ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoney(c.ceiling)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-fin-teal font-medium">{formatMoney(c.funded_to_date)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoney(c.monthly_revenue)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoney(c.annual_revenue)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.margin_pct.toFixed(1)}%</td>
              <td className="px-3 py-2 text-muted-foreground">
                {c.margin_source === "actual" ? "Actuals" : `Portfolio (${portfolioMargin.toFixed(1)}%)`}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                {c.pop_start.slice(0, 7)} → {c.pop_end.slice(0, 7)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Pipeline Scaffold (CW-3) ─────────────────────── */

function PipelineScaffold() {
  return (
    <div className="rounded border border-dashed border-border bg-card p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Pipeline Forecast Layer
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Weighted pipeline / capture opportunities will overlay signed backlog once a pipeline data source is connected.
        This layer renders probability-weighted revenue from active pursuits on top of the contracted forecast.
      </p>
    </div>
  );
}

/* ── Add Task Order Drawer ────────────────────────── */

function AddTaskOrderDrawer({ onClose }: { onClose: () => void }) {
  const createTO = useCreateTaskOrder();
  const [form, setForm] = useState({
    to_name: "",
    to_number: "",
    prime_or_sub: "PRIME" as "PRIME" | "SUB",
    customer_agency: "",
    contracting_office: "",
    pop_start: "",
    pop_end: "",
    total_ceiling: "",
    funded_to_date: "",
    status: "active",
    notes: "",
  });

  const handleSubmit = () => {
    if (!form.to_name || !form.to_number) return;

    createTO.mutate(
      {
        to_name: form.to_name,
        to_number: form.to_number,
        prime_or_sub: form.prime_or_sub,
        customer_agency: form.customer_agency || null,
        contracting_office: form.contracting_office || null,
        pop_start: form.pop_start || null,
        pop_end: form.pop_end || null,
        total_ceiling: form.total_ceiling
          ? Number(form.total_ceiling)
          : null,
        funded_to_date: form.funded_to_date
          ? Number(form.funded_to_date)
          : null,
        status: form.status,
        notes: form.notes || null,
      },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  const setField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full bg-card border-l border-border shadow-lg overflow-y-auto">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">
            Add Task Order
          </h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-[18px] leading-none"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          <FormField
            label="Task Order Name *"
            value={form.to_name}
            onChange={(v) => setField("to_name", v)}
            placeholder="e.g. PEO IEW&S HQ SETA"
          />
          <FormField
            label="Contract Number *"
            value={form.to_number}
            onChange={(v) => setField("to_number", v)}
            placeholder="e.g. W56KGY22F0028"
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                Role
              </label>
              <select
                value={form.prime_or_sub}
                onChange={(e) =>
                  setField("prime_or_sub", e.target.value)
                }
                className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
              >
                <option value="PRIME">Prime</option>
                <option value="SUB">Sub</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
              >
                <option value="active">Active</option>
                <option value="awarded_not_started">Awarded (not started)</option>
                <option value="closeout">Closeout</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          <FormField
            label="Customer Agency"
            value={form.customer_agency}
            onChange={(v) => setField("customer_agency", v)}
            placeholder="e.g. U.S. Army DEVCOM"
          />
          <FormField
            label="Contracting Office"
            value={form.contracting_office}
            onChange={(v) => setField("contracting_office", v)}
            placeholder="e.g. ACC-APG"
          />

          <div className="flex gap-3">
            <FormField
              label="PoP Start"
              value={form.pop_start}
              onChange={(v) => setField("pop_start", v)}
              type="date"
            />
            <FormField
              label="PoP End"
              value={form.pop_end}
              onChange={(v) => setField("pop_end", v)}
              type="date"
            />
          </div>

          <div className="flex gap-3">
            <FormField
              label="Total Ceiling ($)"
              value={form.total_ceiling}
              onChange={(v) => setField("total_ceiling", v)}
              type="number"
              placeholder="0"
            />
            <FormField
              label="Funded to Date ($)"
              value={form.funded_to_date}
              onChange={(v) => setField("funded_to_date", v)}
              type="number"
              placeholder="0"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground resize-none"
              placeholder="Source reference, context..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button
            type="button"
            className="rounded bg-fin-teal px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!form.to_name || !form.to_number || createTO.isPending}
          >
            {createTO.isPending ? "Saving…" : "Save task order"}
          </button>
          <button
            type="button"
            className="rounded border border-border bg-card px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
            onClick={onClose}
          >
            Cancel
          </button>
          {createTO.isError && (
            <span className="text-[11px] text-fin-plum">
              Failed to save. Try again.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Form helpers ─────────────────────────────────── */

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex-1">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
      />
    </div>
  );
}
