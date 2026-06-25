"use client";

import { useMemo } from "react";
import { useTrialBalance } from "@/hooks/use-financial-bible";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";

const TB_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "account_code", type: "string" },
  { field: "account_name", type: "string" },
  { field: "debit", type: "number" },
  { field: "credit", type: "number" },
  { field: "net_balance", type: "number" },
];

export function TrialBalanceTab() {
  const { data, isLoading } = useTrialBalance();
  const { sortBy, sortDir, handleSort } = useTableSort("tb");

  const items = useMemo(() => data?.items ?? [], [data]);

  const sortedItems = useMemo(() => {
    if (!sortBy) return items;
    return sortData(
      items as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      TB_SORT_COLS,
    ) as unknown as typeof items;
  }, [items, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Trial balance data not yet ingested. Upload a Trail Balance report to
        populate.
      </p>
    );
  }

  const totalDebit = items.reduce((s, r) => s + r.debit, 0);
  const totalCredit = items.reduce((s, r) => s + r.credit, 0);
  const netBalance = totalDebit - totalCredit;

  const chartOption = {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      formatter: (params: Array<{ name: string; value: number; marker: string }>) =>
        params.map((p) => `${p.marker} ${p.name}: ${formatMoneyFull(p.value)}`).join("<br/>"),
    },
    legend: {
      data: ["Debits", "Credits"],
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    grid: { left: 60, right: 16, top: 32, bottom: 8 },
    xAxis: {
      type: "value" as const,
      axisLabel: {
        color: "var(--color-fin-stone)",
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    yAxis: {
      type: "category" as const,
      data: ["Total"],
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        name: "Debits",
        type: "bar" as const,
        data: [totalDebit],
        itemStyle: { color: "var(--color-fin-navy)" },
        label: {
          show: true,
          position: "right" as const,
          fontSize: 11,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
      {
        name: "Credits",
        type: "bar" as const,
        data: [totalCredit],
        itemStyle: { color: "var(--color-fin-plum)" },
        label: {
          show: true,
          position: "right" as const,
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
      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Total Debits" value={formatMoney(totalDebit)} subtitle={`${items.length} accounts`} />
        <Kpi label="Total Credits" value={formatMoney(totalCredit)} />
        <Kpi label="Net Balance" value={formatMoney(netBalance)} />
      </div>

      {/* Chart */}
      <div className="rounded border border-border bg-white p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Debits vs Credits
        </p>
        <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 120 }} notMerge />
      </div>

      {/* Table with sticky header + sortable columns */}
      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Acct Code" field="account_code" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Account Name" field="account_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Debit" field="debit" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Credit" field="credit" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Net Balance" field="net_balance" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((r) => (
              <tr key={r.id} className="border-b border-border hover:bg-gda-panel/50">
                <td className="px-3 py-2 text-left text-foreground">{r.period}</td>
                <td className="px-3 py-2 text-left text-muted-foreground tabular-nums">{r.account_code}</td>
                <td className="px-3 py-2 text-left text-foreground">{r.account_name}</td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {r.debit > 0 ? formatMoneyFull(r.debit) : "—"}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {r.credit > 0 ? formatMoneyFull(r.credit) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatMoneyFull(r.net_balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
