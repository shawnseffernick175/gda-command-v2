"use client";

import { useMemo } from "react";
import { useArData } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";

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
  const bucketEntries = [...buckets.entries()];

  const chartOption = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params.map((p) => `${p.marker} ${p.name}: ${formatMoneyFull(p.value)}`).join("<br/>"),
    },
    legend: { show: false },
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
        data: bucketEntries.map(([, amt]) => amt),
        itemStyle: { color: "var(--color-fin-navy)" },
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

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="Total Receivables" value={formatMoney(total)} subtitle={`${items.length} items`} />
        {bucketEntries.map(([bucket, amt]) => (
          <Kpi key={bucket} label={bucket} value={formatMoney(amt)} />
        ))}
      </div>

      {/* Chart */}
      <div className="rounded border border-border bg-white p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Receivables by Age Bucket
        </p>
        <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 240 }} notMerge />
      </div>

      {/* Table with sticky header + sortable columns */}
      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
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
    </div>
  );
}
