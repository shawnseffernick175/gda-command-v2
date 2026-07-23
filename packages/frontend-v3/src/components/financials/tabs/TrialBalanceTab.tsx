"use client";

import { Fragment, useMemo, useState } from "react";
import { useTrialBalance } from "@/hooks/use-financial-bible";
import type { TrialBalanceRow } from "@/lib/types";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import { FinSourceStrip } from "@/components/financials/FinSourceStrip";

/* Account classes derived from the leading digit of the GL account code —
 * a deterministic classification of the ingested `account_code`, not invented
 * data. Order follows standard balance-sheet → income-statement sequence. */
interface AccountClass {
  key: string;
  label: string;
  color: string;
}
const CLASSES: AccountClass[] = [
  { key: "1", label: "Assets", color: "var(--color-fin-chart-navy)" },
  { key: "2", label: "Liabilities", color: "var(--color-fin-plum)" },
  { key: "3", label: "Equity", color: "var(--color-fin-teal)" },
  { key: "4", label: "Revenue", color: "var(--color-fin-chart-green)" },
  { key: "5", label: "Expenses", color: "var(--color-fin-chart-orange)" },
  { key: "other", label: "Other / Unclassified", color: "var(--color-fin-stone)" },
];

function classKeyFor(code: string): string {
  const d = code.trim()[0];
  if (d === "1" || d === "2" || d === "3" || d === "4") return d;
  if (d === "5" || d === "6" || d === "7" || d === "8" || d === "9") return "5";
  return "other";
}

export function TrialBalanceTab() {
  const { data, isLoading } = useTrialBalance();
  const [showZero, setShowZero] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  const items = useMemo(() => data?.items ?? [], [data]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Trial balance data not yet ingested. Upload a Trial Balance report to
        populate.
      </p>
    );
  }

  const totalDebit = items.reduce((s, r) => s + r.debit, 0);
  const totalCredit = items.reduce((s, r) => s + r.credit, 0);
  const netBalance = totalDebit - totalCredit;
  const nonZeroCount = items.filter((r) => r.net_balance !== 0).length;

  const q = query.trim().toLowerCase();
  const filtered = items.filter((r) => {
    if (!showZero && r.net_balance === 0 && r.debit === 0 && r.credit === 0) return false;
    if (q && !`${r.account_code} ${r.account_name}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // Group by class
  const groups = new Map<string, TrialBalanceRow[]>();
  for (const r of filtered) {
    const k = classKeyFor(r.account_code);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const classSummary = CLASSES.map((c) => {
    const rows = groups.get(c.key) ?? [];
    const net = rows.reduce((s, r) => s + r.net_balance, 0);
    return { ...c, rows, net };
  }).filter((c) => c.rows.length > 0);

  const periods = [...new Set(items.map((r) => r.period))];
  const periodLabel = periods.length === 1 ? periods[0] : `${periods.length} periods`;

  // Class-composition chart: net balance magnitude by class
  const compChart = {
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
      data: classSummary.map((c) => c.label),
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        type: "bar" as const,
        data: classSummary.map((c) => ({ value: Math.abs(c.net), itemStyle: { color: c.color } })),
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

  const colSpan = 4;

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Debits" value={formatMoney(totalDebit)} subtitle={`${items.length} accounts`} />
        <Kpi label="Total Credits" value={formatMoney(totalCredit)} />
        <Kpi label="Net Balance" value={formatMoney(netBalance)} subtitle={Math.abs(netBalance) < 1 ? "in balance" : "out of balance"} />
        <Kpi label="Active Accounts" value={String(nonZeroCount)} subtitle="non-zero ending balance" />
      </div>

      {/* Class-composition chart */}
      <div className="rounded border border-border bg-card p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Net Balance by Account Class
        </p>
        <ReactEChartsCore
          echarts={echarts}
          option={compChart}
          style={{ height: Math.max(140, classSummary.length * 34) }}
          notMerge
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by code or account name…"
          className="w-64 rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
        />
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
          Show zero-balance accounts
        </label>
      </div>

      {/* Grouped ledger */}
      <div className="rounded border border-border overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 text-right font-medium">Net Balance</th>
            </tr>
          </thead>
          <tbody>
            {classSummary.map((c) => {
              const isCollapsed = collapsed[c.key];
              return (
                <Fragment key={c.key}>
                  <tr
                    className="border-b border-border bg-gda-panel/30 cursor-pointer hover:bg-gda-panel/50"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [c.key]: !prev[c.key] }))}
                  >
                    <td className="px-3 py-2 text-left font-medium text-foreground">
                      <span className="mr-1 inline-block w-3 text-muted-foreground">
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                      {c.label}
                      <span className="ml-2 text-[11px] text-muted-foreground">({c.rows.length})</span>
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-medium text-foreground tabular-nums">
                      {formatMoneyFull(c.net)}
                    </td>
                  </tr>
                  {!isCollapsed &&
                    c.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border hover:bg-gda-panel/50">
                        <td className="px-3 py-2 text-left">
                          <span className="pl-6 text-muted-foreground tabular-nums">{r.account_code}</span>
                          <span className="ml-2 text-foreground">{r.account_name}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-foreground tabular-nums">
                          {r.debit !== 0 ? formatMoneyFull(r.debit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-foreground tabular-nums">
                          {r.credit !== 0 ? formatMoneyFull(r.credit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-foreground tabular-nums">
                          {formatMoneyFull(r.net_balance)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {classSummary.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  No accounts match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FinSourceStrip
        table="trial_balance"
        rowCount={items.length}
        period={periodLabel}
        note="account class derived from account code; source Beginning/Ending columns not in ingest"
      />
    </div>
  );
}
