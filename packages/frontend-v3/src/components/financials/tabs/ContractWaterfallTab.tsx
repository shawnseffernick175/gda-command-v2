"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  useContractWaterfall,
  useCreateTaskOrder,
  useBulkCreateTaskOrders,
} from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import type { ContractWaterfallData, WaterfallContract } from "@/lib/types";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const CONTRACT_COLUMNS: ColumnSortConfig[] = [
  { field: "to_name", type: "string" },
  { field: "parent_vehicle_short_name", type: "string" },
  { field: "ceiling", type: "number" },
  { field: "funded_to_date", type: "number" },
  { field: "monthly_revenue", type: "number" },
  { field: "annual_revenue", type: "number" },
  { field: "margin_pct", type: "number" },
  { field: "margin_source", type: "string" },
  { field: "pop_start", type: "date" },
];

type ViewMode = "revenue" | "profit" | "both";
type StatusFilter = "" | "active" | "closeout" | "expired" | "awarded_not_started";
type RoleFilter = "" | "PRIME" | "SUB";

/* ── Vehicle color lookup ─────────────────────────── */

const VEHICLE_COLORS: Record<string, string> = {
  RS3: "var(--color-fin-teal)",
  TRAYSYS: "#2D6A4F", // allowed-hex
  "Seaport NxG": "#1B4332", // allowed-hex
  "GSA MAS": "#3D405B", // allowed-hex
  "OASIS SB Pool 1": "#5F0F40", // allowed-hex
  "OASIS SB Pool 3": "#6A4C93", // allowed-hex
  eFAST: "#264653", // allowed-hex
  EAGLE: "#2A9D8F", // allowed-hex
  "TSS-E": "#E76F51", // allowed-hex
  "CIO-SP3 SB": "#F4A261", // allowed-hex
  "CIO-SP3 8(a)": "#E9C46A", // allowed-hex
};

function getContractColor(c: WaterfallContract, idx: number): string {
  if (c.parent_vehicle_short_name && VEHICLE_COLORS[c.parent_vehicle_short_name]) {
    return VEHICLE_COLORS[c.parent_vehicle_short_name];
  }
  const palette = [
    "#01696F", "#2D6A4F", "#3D405B", "#5F0F40", "#6A4C93", "#264653", "#E76F51", // allowed-hex
  ];
  return palette[idx % palette.length];
}

/* ── Main component ───────────────────────────────── */

export function ContractWaterfallTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [vehicleFilter, setVehicleFilter] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [addFormOpen, setAddFormOpen] = useState(false);

  const params = useMemo(
    () => ({
      status: statusFilter || undefined,
      prime_or_sub: roleFilter || undefined,
      parent_vehicle_id: vehicleFilter.length === 1 ? vehicleFilter[0] : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }),
    [statusFilter, roleFilter, vehicleFilter, dateFrom, dateTo],
  );

  const { data, isLoading, error } = useContractWaterfall(params);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading contract waterfall\u2026
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
      <WaterfallFilterBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        availableVehicles={data.available_vehicles}
        vehicleFilter={vehicleFilter}
        setVehicleFilter={setVehicleFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
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
    <div className="space-y-4">
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-[15px] font-medium text-foreground mb-2">
          No funded task orders
        </p>
        <p className="text-[12px] text-muted-foreground mb-4 max-w-md mx-auto">
          The Contract Waterfall shows funded dollars from awarded Task Orders.
          Add a task order manually or upload a CSV to populate the forecast.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="rounded bg-fin-teal px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90"
            onClick={onAddTaskOrder}
          >
            + Add Task Order
          </button>
          <CsvUploadButton />
        </div>
      </div>
      {addFormOpen && <AddTaskOrderDrawer onClose={onCloseAddForm} />}
    </div>
  );
}

/* ── Filter Bar ───────────────────────────────────── */

function WaterfallFilterBar({
  viewMode,
  setViewMode,
  statusFilter,
  setStatusFilter,
  roleFilter,
  setRoleFilter,
  availableVehicles,
  vehicleFilter,
  setVehicleFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
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
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  onAddTaskOrder: () => void;
}) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-4">
        {/* View toggle */}
        <FilterGroup label="View">
          <div className="flex items-center rounded border border-border">
            {(["revenue", "profit", "both"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
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
        </FilterGroup>

        {/* Date range */}
        <FilterGroup label="From">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground w-[130px]"
          />
        </FilterGroup>

        <FilterGroup label="To">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground w-[130px]"
          />
        </FilterGroup>

        {/* Status */}
        <FilterGroup label="Status">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground min-w-[120px]"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="awarded_not_started">Awarded</option>
            <option value="closeout">Closeout</option>
            <option value="expired">Expired</option>
          </select>
        </FilterGroup>

        {/* Prime / Sub */}
        <FilterGroup label="Role">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground min-w-[100px]"
          >
            <option value="">All roles</option>
            <option value="PRIME">Prime</option>
            <option value="SUB">Sub</option>
          </select>
        </FilterGroup>

        {/* Vehicle */}
        {availableVehicles.length > 0 && (
          <FilterGroup label="Vehicle">
            <select
              value={vehicleFilter.length === 1 ? String(vehicleFilter[0]) : ""}
              onChange={(e) => {
                const val = e.target.value;
                setVehicleFilter(val ? [Number(val)] : []);
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground min-w-[130px]"
            >
              <option value="">All vehicles</option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.short_name}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}

        {/* Actions (right-aligned) */}
        <div className="ml-auto flex items-end gap-2">
          <CsvUploadButton />
          <button
            type="button"
            className="rounded bg-fin-teal px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:opacity-90"
            onClick={onAddTaskOrder}
          >
            + Add TO
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ── CSV Upload Button ────────────────────────────── */

function CsvUploadButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkCreate = useBulkCreateTaskOrders();
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setParseError(null);

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const rows = parseCsvToTaskOrders(text);
          if (rows.length === 0) {
            setParseError("No valid rows found in CSV.");
            return;
          }
          bulkCreate.mutate(
            { task_orders: rows },
            {
              onError: () => setParseError("Upload failed. Check data and retry."),
            },
          );
        } catch {
          setParseError("Could not parse CSV. Check format.");
        }
      };
      reader.readAsText(file);
      // Reset so re-uploading the same file triggers onChange
      e.target.value = "";
    },
    [bulkCreate],
  );

  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        className="rounded border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50"
        onClick={() => fileRef.current?.click()}
        disabled={bulkCreate.isPending}
      >
        {bulkCreate.isPending ? "Uploading\u2026" : "Upload CSV"}
      </button>
      {parseError && (
        <span className="absolute top-full left-0 mt-1 text-[12px] text-fin-plum whitespace-nowrap">
          {parseError}
        </span>
      )}
    </div>
  );
}

function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNumeric(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function parseCsvToTaskOrders(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  const nameIdx = headers.findIndex((h) => h === "to_name" || h === "name" || h === "task_order_name");
  const numIdx = headers.findIndex((h) => h === "to_number" || h === "contract_number" || h === "number");
  const roleIdx = headers.findIndex((h) => h === "prime_or_sub" || h === "role");
  const agencyIdx = headers.findIndex((h) => h === "customer_agency" || h === "agency");
  const officeIdx = headers.findIndex((h) => h === "contracting_office" || h === "office");
  const startIdx = headers.findIndex((h) => h === "pop_start" || h === "start");
  const endIdx = headers.findIndex((h) => h === "pop_end" || h === "end");
  const ceilingIdx = headers.findIndex((h) => h === "total_ceiling" || h === "ceiling");
  const fundedIdx = headers.findIndex((h) => h === "funded_to_date" || h === "funded");
  const statusIdx = headers.findIndex((h) => h === "status");
  const vehicleIdx = headers.findIndex((h) => h === "vehicle" || h === "parent_vehicle_short_name");
  const notesIdx = headers.findIndex((h) => h === "notes");

  if (nameIdx < 0 || numIdx < 0) return [];

  const result: Array<{
    to_name: string;
    to_number: string;
    parent_vehicle_short_name?: string | null;
    prime_or_sub: "PRIME" | "SUB";
    customer_agency?: string | null;
    contracting_office?: string | null;
    pop_start?: string | null;
    pop_end?: string | null;
    total_ceiling?: number | null;
    funded_to_date?: number | null;
    status?: string;
    notes?: string | null;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const name = cols[nameIdx] ?? "";
    const num = cols[numIdx] ?? "";
    if (!name || !num) continue;

    const rawRole = roleIdx >= 0 ? (cols[roleIdx] ?? "").toUpperCase() : "PRIME";
    const role: "PRIME" | "SUB" = rawRole === "SUB" ? "SUB" : "PRIME";

    result.push({
      to_name: name,
      to_number: num,
      prime_or_sub: role,
      parent_vehicle_short_name: vehicleIdx >= 0 ? cols[vehicleIdx] || null : null,
      customer_agency: agencyIdx >= 0 ? cols[agencyIdx] || null : null,
      contracting_office: officeIdx >= 0 ? cols[officeIdx] || null : null,
      pop_start: startIdx >= 0 ? cols[startIdx] || null : null,
      pop_end: endIdx >= 0 ? cols[endIdx] || null : null,
      total_ceiling: ceilingIdx >= 0 && cols[ceilingIdx] ? parseNumeric(cols[ceilingIdx]) : null,
      funded_to_date: fundedIdx >= 0 && cols[fundedIdx] ? parseNumeric(cols[fundedIdx]) : null,
      status: statusIdx >= 0 ? cols[statusIdx] || "active" : "active",
      notes: notesIdx >= 0 ? cols[notesIdx] || null : null,
    });
  }
  return result;
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
      <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`text-[16px] tabular-nums font-semibold ${accent ? "text-fin-teal" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ── ECharts Waterfall Chart (CDN-loaded) ─────────── */

function WaterfallChart({ data, viewMode }: { data: ContractWaterfallData; viewMode: ViewMode }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EChartsInstance | null>(null);

  const option = useMemo(() => {
    const months = data.forecast.map((f) => f.month);
    const showRevenue = viewMode === "revenue" || viewMode === "both";
    const showProfit = viewMode === "profit" || viewMode === "both";

    const series: Record<string, unknown>[] = [];

    if (showRevenue) {
      for (let i = 0; i < data.contracts.length; i++) {
        const contract = data.contracts[i];
        const color = getContractColor(contract, i);

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
        lineStyle: { color: "#A12C7B", width: 2 }, // allowed-hex
        itemStyle: { color: "#A12C7B" }, // allowed-hex
        symbol: "circle",
        symbolSize: 4,
        yAxisIndex: showRevenue ? 1 : 0,
      });
    }

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      legend: {
        type: "scroll",
        bottom: 0,
        textStyle: { fontSize: 12, color: "#7A7974" }, // allowed-hex
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
          fontSize: 12,
          color: "#7A7974", // allowed-hex
          rotate: 45,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#D4D1CA" } }, // allowed-hex
      },
      yAxis: [
        {
          type: "value",
          name: showRevenue ? "Revenue ($)" : "Profit ($)",
          nameTextStyle: { fontSize: 12, color: "#7A7974" }, // allowed-hex
          axisLabel: { fontSize: 12, color: "#7A7974" }, // allowed-hex
          splitLine: { lineStyle: { color: "#D4D1CA", type: "dashed" } }, // allowed-hex
        },
        ...(showRevenue && showProfit
          ? [
              {
                type: "value",
                name: "Profit ($)",
                nameTextStyle: { fontSize: 12, color: "#A12C7B" }, // allowed-hex
                axisLabel: { fontSize: 12, color: "#A12C7B" }, // allowed-hex
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      dataZoom: [
        { type: "inside", start: 0, end: 100 },
        { type: "slider", start: 0, end: 100, height: 20, bottom: 30 },
      ],
      series,
    };
  }, [data, viewMode]);

  useEffect(() => {
    if (!chartRef.current || typeof window === "undefined" || !window.echarts) return;

    if (!instanceRef.current) {
      instanceRef.current = window.echarts.init(chartRef.current);
    }
    instanceRef.current.setOption(option, true);

    const handleResize = () => instanceRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [option]);

  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Task Order Revenue/Profit Forecast
        </h3>
        <span className="text-[12px] text-muted-foreground">
          Funded TOs only {"\u2014"} IDIQs excluded
        </span>
      </div>
      <div ref={chartRef} style={{ height: 380, width: "100%" }} />
    </div>
  );
}

/* ── Contract Table ───────────────────────────────── */

function ContractTable({ contracts, portfolioMargin }: { contracts: WaterfallContract[]; portfolioMargin: number }) {
  const { sortBy, sortDir, handleSort } = useTableSort("cw");
  const sorted = sortData(
    contracts as unknown as Record<string, unknown>[],
    sortBy,
    sortDir,
    CONTRACT_COLUMNS,
  ) as unknown as WaterfallContract[];
  return (
    <div className="rounded border border-border bg-card overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border bg-gda-bg-deep">
            <SortableHeader label="Task Order" field="to_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Vehicle" field="parent_vehicle_short_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Ceiling" field="ceiling" align="right" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Funded" field="funded_to_date" align="right" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Monthly Rev" field="monthly_revenue" align="right" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Annual Rev" field="annual_revenue" align="right" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Margin" field="margin_pct" align="right" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Source" field="margin_source" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="PoP" field="pop_start" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-gda-bg-deep/50">
              <td className="px-3 py-2 font-medium text-foreground">{c.to_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.parent_vehicle_short_name ?? "\u2014"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(c.ceiling)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-fin-teal font-medium">{formatMoneyFull(c.funded_to_date)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(c.monthly_revenue)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatMoneyFull(c.annual_revenue)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.margin_pct.toFixed(1)}%</td>
              <td className="px-3 py-2 text-muted-foreground">
                {c.margin_source === "actual" ? "Actuals" : `Portfolio (${portfolioMargin.toFixed(1)}%)`}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                {c.pop_start.slice(0, 7)} {"\u2192"} {c.pop_end.slice(0, 7)}
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
      <p className="text-[12px] text-muted-foreground">
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
            {"\u00D7"}
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
              <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                Role
              </label>
              <select
                value={form.prime_or_sub}
                onChange={(e) =>
                  setField("prime_or_sub", e.target.value)
                }
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
              >
                <option value="PRIME">Prime</option>
                <option value="SUB">Sub</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
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
            <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground resize-none"
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
            {createTO.isPending ? "Saving\u2026" : "Save task order"}
          </button>
          <button
            type="button"
            className="rounded border border-border bg-card px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
            onClick={onClose}
          >
            Cancel
          </button>
          {createTO.isError && (
            <span className="text-[12px] text-fin-plum">
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
      <label className="text-[12px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
      />
    </div>
  );
}
