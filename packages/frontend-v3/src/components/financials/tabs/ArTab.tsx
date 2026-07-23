"use client";

import { useMemo, useState } from "react";
import { useArData } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import { ArContractMatrix } from "@/components/financials/tabs/ArContractMatrix";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";
import { orderBuckets, bucketColor } from "@/lib/aging";
import { cn } from "@/lib/utils";

const AR_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "customer_name", type: "string" },
  { field: "invoice_number", type: "string" },
  { field: "amount", type: "number" },
  { field: "age_bucket", type: "string" },
  { field: "due_date", type: "date" },
];

export function ArTab() {
  const { data, isLoading } = useArData();
  const { sortBy, sortDir, handleSort } = useTableSort("ar");
  const [matrixOpen, setMatrixOpen] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);

  const sortedItems = useMemo(() => {
    if (!sortBy) return items;
    return sortData(
      items as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      AR_SORT_COLS,
    ) as unknown as typeof items;
  }, [items, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        AR data not yet ingested. Upload an Aged AR report to populate.
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
  const pctCurrent = total !== 0 ? (currentAmt / total) * 100 : 0;

  // Customer concentration (top receivable customers)
  const byCustomer = new Map<string, number>();
  for (const r of items) {
    byCustomer.set(r.customer_name, (byCustomer.get(r.customer_name) ?? 0) + r.amount);
  }
  const topCustomers = [...byCustomer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topCustomerLabel = topCustomers[0]?.[0] ?? "—";

  const periods = [...new Set(items.map((r) => r.period))];
  const periodLabel = periods.length === 1 ? periods[0] : `${periods.length} periods`;

  // Horizontal 100%-stacked aging bar — reads at laptop width without scroll.
  const agingBar = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) =>
        params
          .filter((p) => p.value > 0)
          .map(
            (p) =>
              `${p.marker} ${p.seriesName}: ${formatMoneyFull(p.value)} (${
                total ? ((p.value / total) * 100).toFixed(1) : "0"
              }%)`,
          )
          .join("<br/>"),
    },
    legend: {
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    grid: { left: 8, right: 8, top: 8, bottom: 32 },
    xAxis: {
      type: "value" as const,
      max: total,
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category" as const,
      data: ["AR"],
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: bucketEntries.map(([bucket, amt], i) => ({
      name: bucket,
      type: "bar" as const,
      stack: "aging",
      data: [amt],
      itemStyle: { color: bucketColor(bucket, i, bucketEntries.length) },
      label: {
        show: total ? amt / total > 0.06 : false,
        color: "#fff",
        fontSize: 11,
        formatter: (p: { value: number }) => formatMoney(p.value),
      },
    })),
  };

  const concentrationBar = {
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
      data: topCustomers.map(([c]) => (c.length > 26 ? c.slice(0, 24) + "…" : c)),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: topCustomers.map(([, amt]) => amt),
        itemStyle: { color: "var(--color-fin-navy)" },
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

  return (
    <div className="space-y-6">
      {/* Health summary — laptop-first, no horizontal scroll */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Receivables" value={formatMoney(total)} subtitle={`${items.length} open items`} />
        <Kpi label="% Current" value={`${pctCurrent.toFixed(1)}%`} subtitle="of total AR" />
        <Kpi
          label="Past Due"
          value={formatMoney(total - currentAmt)}
          subtitle={`${(100 - pctCurrent).toFixed(1)}% of AR`}
        />
        <Kpi label="Top Customer" value={formatMoney(topCustomers[0]?.[1] ?? 0)} subtitle={topCustomerLabel} />
      </div>

      {/* Aging composition */}
      <div className="rounded border border-border bg-card p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Receivables Aging — composition
        </p>
        <ReactEChartsCore echarts={echarts} option={agingBar} style={{ height: 120 }} notMerge />
      </div>

      {/* Customer concentration */}
      <div className="rounded border border-border bg-card p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Top Customers by Open Receivable
        </p>
        <ReactEChartsCore
          echarts={echarts}
          option={concentrationBar}
          style={{ height: Math.max(140, topCustomers.length * 30) }}
          notMerge
        />
      </div>

      {/* Contract × month matrix — opt-in secondary view (wide; laptop scroll) */}
      <div className="rounded border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-foreground hover:bg-gda-panel/40"
          onClick={() => setMatrixOpen((v) => !v)}
        >
          <span className="inline-block w-3 text-muted-foreground">{matrixOpen ? "▾" : "▸"}</span>
          Receivables by Contract (month-by-month matrix)
        </button>
        {matrixOpen && (
          <div className="px-4 pb-4">
            <ArContractMatrix />
          </div>
        )}
      </div>

      {/* Detail table */}
      <div className={cn("rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto")}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Customer" field="customer_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Invoice #" field="invoice_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Amount" field="amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Age Bucket" field="age_bucket" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Due Date" field="due_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((r) => (
              <tr key={r.id} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{r.period}</td>
                <td className="px-3 py-2 text-left text-foreground">{r.customer_name}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.invoice_number ?? "—"}</td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">{formatMoneyFull(r.amount)}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.age_bucket ?? "—"}</td>
                <td className="px-3 py-2 text-left text-muted-foreground">{r.due_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinSourceStrip table="ar_actuals" rowCount={items.length} period={periodLabel} />
    </div>
  );
}
