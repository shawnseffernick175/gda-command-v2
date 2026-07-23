"use client";

import { useMemo } from "react";
import { useApData } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";
import { orderBuckets, bucketColor, isOverdue } from "@/lib/aging";

const AP_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "vendor_name", type: "string" },
  { field: "invoice_number", type: "string" },
  { field: "amount", type: "number" },
  { field: "age_bucket", type: "string" },
  { field: "status", type: "string" },
  { field: "due_date", type: "date" },
];

// Payment-status semantics from the Open AP report: HOLD is withheld cash (risk),
// PPHOLD is a partial/pending hold (watch), PAID/other is cleared (healthy).
function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === "HOLD") return "var(--color-fin-chart-red)";
  if (s === "PPHOLD") return "var(--color-fin-chart-orange)";
  if (s === "PAID") return "var(--color-fin-chart-green)";
  return "var(--color-fin-stone)";
}

export function ApTab() {
  const { data, isLoading } = useApData();
  const { sortBy, sortDir, handleSort } = useTableSort("ap");

  const items = useMemo(() => data?.items ?? [], [data]);

  const sortedItems = useMemo(() => {
    if (!sortBy) return items;
    return sortData(
      items as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      AP_SORT_COLS,
    ) as unknown as typeof items;
  }, [items, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        AP data not yet ingested. Upload an Open AP Report to populate.
      </p>
    );
  }

  const total = items.reduce((s, r) => s + r.amount, 0);

  const buckets = new Map<string, number>();
  for (const r of items) {
    const key = r.age_bucket ?? "Unclassified";
    buckets.set(key, (buckets.get(key) ?? 0) + r.amount);
  }
  const bucketEntries = orderBuckets([...buckets.entries()]);
  const currentAmt = buckets.get("Current") ?? 0;
  const overdueAmt = bucketEntries
    .filter(([b]) => isOverdue(b))
    .reduce((s, [, amt]) => s + amt, 0);

  // Payment status (HOLD / PAID / PPHOLD) — only present once a doc is
  // re-ingested through the fixed parser; older rows carry null status.
  const statusMap = new Map<string, number>();
  let statusRowCount = 0;
  for (const r of items) {
    if (r.status == null) continue;
    statusRowCount++;
    statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + r.amount);
  }
  const hasStatus = statusRowCount > 0;
  const statusEntries = [...statusMap.entries()].sort((a, b) => b[1] - a[1]);
  const holdAmt = statusMap.get("HOLD") ?? 0;

  // Vendor concentration
  const byVendor = new Map<string, number>();
  for (const r of items) {
    byVendor.set(r.vendor_name, (byVendor.get(r.vendor_name) ?? 0) + r.amount);
  }
  const topVendors = [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const periods = [...new Set(items.map((r) => r.period))];
  const periodLabel = periods.length === 1 ? periods[0] : `${periods.length} periods`;

  // Risk-colored aging bars — green (current) → red (over 90)
  const agingBar = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params
          .map(
            (p) =>
              `${p.marker} ${p.name}: ${formatMoneyFull(p.value)} (${
                total ? ((p.value / total) * 100).toFixed(1) : "0"
              }%)`,
          )
          .join("<br/>"),
    },
    grid: { left: 60, right: 16, top: 8, bottom: 32 },
    xAxis: {
      type: "category" as const,
      data: bucketEntries.map(([b]) => b),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
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
        type: "bar" as const,
        data: bucketEntries.map(([bucket, amt], i) => ({
          value: amt,
          itemStyle: { color: bucketColor(bucket, i, bucketEntries.length) },
        })),
        label: {
          show: true,
          position: "top" as const,
          fontSize: 11,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
    ],
  };

  const vendorBar = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params.map((p) => `${p.marker} ${p.name}: ${formatMoneyFull(p.value)}`).join("<br/>"),
    },
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: "value" as const,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 10, formatter: (v: number) => formatMoney(v) },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    yAxis: {
      type: "category" as const,
      inverse: true,
      data: topVendors.map(([v]) => (v.length > 26 ? v.slice(0, 24) + "…" : v)),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: topVendors.map(([, amt]) => amt),
        itemStyle: { color: "var(--color-fin-plum)" },
        label: {
          show: true,
          position: "right" as const,
          fontSize: 10,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
    ],
  };

  const statusDonut = {
    tooltip: {
      trigger: "item" as const,
      formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
        `${p.marker} ${p.name}: ${formatMoneyFull(p.value)} (${p.percent.toFixed(1)}%)`,
    },
    legend: {
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    series: [
      {
        type: "pie" as const,
        radius: ["45%", "70%"],
        center: ["50%", "44%"],
        data: statusEntries.map(([status, amt]) => ({
          name: status,
          value: amt,
          itemStyle: { color: statusColor(status) },
        })),
        label: {
          color: "var(--color-fin-stone)",
          fontSize: 11,
          formatter: (p: { name: string; percent: number }) => `${p.name} ${p.percent.toFixed(0)}%`,
        },
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Payables" value={formatMoney(total)} subtitle={`${items.length} open items`} />
        <Kpi label="Current" value={formatMoney(currentAmt)} subtitle={`${total ? ((currentAmt / total) * 100).toFixed(1) : "0"}% of AP`} />
        {hasStatus ? (
          <Kpi label="On HOLD" value={formatMoney(holdAmt)} subtitle={`${total ? ((holdAmt / total) * 100).toFixed(1) : "0"}% of AP withheld`} />
        ) : (
          <Kpi label="Past Due" value={formatMoney(overdueAmt)} subtitle={`${total ? ((overdueAmt / total) * 100).toFixed(1) : "0"}% of AP`} />
        )}
        <Kpi label="Top Vendor" value={formatMoney(topVendors[0]?.[1] ?? 0)} subtitle={topVendors[0]?.[0] ?? "—"} />
      </div>

      {/* Payment status breakdown (real, when ingested) */}
      {hasStatus && (
        <div className="rounded border border-border bg-card p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Open Payables by Payment Status
          </p>
          <ReactEChartsCore echarts={echarts} option={statusDonut} style={{ height: 260 }} notMerge />
        </div>
      )}

      {/* Aging + vendor concentration */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-border bg-card p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Payables by Age Bucket (risk-colored)
          </p>
          <ReactEChartsCore echarts={echarts} option={agingBar} style={{ height: 240 }} notMerge />
        </div>
        <div className="rounded border border-border bg-card p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Top Vendors by Open Payable
          </p>
          <ReactEChartsCore
            echarts={echarts}
            option={vendorBar}
            style={{ height: Math.max(180, topVendors.length * 28) }}
            notMerge
          />
        </div>
      </div>

      {/* Detail table */}
      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Vendor" field="vendor_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Invoice #" field="invoice_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Amount" field="amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Age Bucket" field="age_bucket" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              {hasStatus && (
                <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              )}
              <SortableHeader label="Due Date" field="due_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((r) => (
              <tr key={r.id} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{r.period}</td>
                <td className="px-3 py-2 text-left text-foreground">{r.vendor_name}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.invoice_number ?? "—"}</td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">{formatMoneyFull(r.amount)}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.age_bucket ?? "—"}</td>
                {hasStatus && (
                  <td className="px-3 py-2 text-left text-muted-foreground">{r.status ?? "—"}</td>
                )}
                <td className="px-3 py-2 text-left text-muted-foreground">{r.due_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinSourceStrip
        table="ap_actuals"
        rowCount={items.length}
        period={periodLabel}
        note={hasStatus ? undefined : "payment status (HOLD/PAID) shown once the Open AP report is re-ingested"}
      />
    </div>
  );
}
