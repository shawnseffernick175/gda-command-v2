"use client";

import { useMemo } from "react";
import { useBalanceSheet } from "@/hooks/use-balance-sheet";
import { formatMoney, formatMoneyFull } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, parsePeriod, type ColumnSortConfig } from "@/lib/sort-utils";

const BS_SORT_COLS: ColumnSortConfig[] = [
  { field: "period", type: "period" },
  { field: "total_assets", type: "number" },
  { field: "total_liabilities", type: "number" },
  { field: "total_equity", type: "number" },
  { field: "cash", type: "number" },
  { field: "accounts_receivable", type: "number" },
  { field: "accounts_payable", type: "number" },
];

function SparkLine({
  points,
  max,
  color,
}: {
  points: number[];
  max: number;
  color: string;
}) {
  if (points.length < 2 || max === 0) return null;
  const w = 100;
  const h = 40;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-10"
      preserveAspectRatio="none"
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BalanceSheetCard() {
  const { data, isLoading } = useBalanceSheet();
  const { sortBy, sortDir, handleSort } = useTableSort("bs");

  const sortedTrend = useMemo(() => {
    const trend = data?.trend;
    if (!trend) return [];
    const rows = trend as unknown as Record<string, unknown>[];
    if (sortBy) {
      return sortData(rows, sortBy, sortDir, BS_SORT_COLS) as unknown as typeof trend;
    }
    return [...trend].sort(
      (a, b) => parsePeriod(a.period) - parsePeriod(b.period),
    );
  }, [data, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (!data?.latest) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Balance sheet data not yet ingested
      </p>
    );
  }

  const { latest } = data;
  const totalAssetsMax = Math.max(...sortedTrend.map((r) => r.total_assets), 1);

  const summaryCards = [
    { label: "Cash", value: latest.cash },
    { label: "Accounts Receivable", value: latest.accounts_receivable },
    { label: "Accounts Payable", value: latest.accounts_payable },
    { label: "Total Equity", value: latest.total_equity },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          As of {latest.period}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summaryCards.map((c) => (
          <Kpi
            key={c.label}
            label={c.label}
            value={formatMoney(c.value)}
          />
        ))}
      </div>

      {sortedTrend.length >= 2 && (
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[12px] text-muted-foreground">
            Total Assets Trend
          </p>
          <SparkLine
            points={sortedTrend.map((r) => r.total_assets).reverse()}
            max={totalAssetsMax}
            color="var(--color-gda-cyan)"
          />
        </div>
      )}

      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Period" field="period" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Total Assets" field="total_assets" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Total Liabilities" field="total_liabilities" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Total Equity" field="total_equity" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Cash" field="cash" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="AR" field="accounts_receivable" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="AP" field="accounts_payable" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedTrend.map((r) => (
              <tr
                key={r.period}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-foreground">
                  {r.period}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoneyFull(r.total_assets)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoneyFull(r.total_liabilities)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoneyFull(r.total_equity)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoneyFull(r.cash)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoneyFull(r.accounts_receivable)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoneyFull(r.accounts_payable)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
