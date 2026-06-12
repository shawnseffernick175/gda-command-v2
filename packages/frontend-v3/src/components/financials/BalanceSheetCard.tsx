"use client";

import { useBalanceSheet } from "@/hooks/use-balance-sheet";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

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

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  if (!data?.latest) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Balance sheet data not yet ingested
      </p>
    );
  }

  const { latest, trend } = data;
  const totalAssetsMax = Math.max(...trend.map((r) => r.total_assets), 1);

  const summaryCards = [
    { label: "Cash", value: latest.cash, textClass: "text-gda-cyan" },
    {
      label: "Accounts Receivable",
      value: latest.accounts_receivable,
      textClass: "text-gda-green",
    },
    {
      label: "Accounts Payable",
      value: latest.accounts_payable,
      textClass: "text-amber-400",
    },
    {
      label: "Total Equity",
      value: latest.total_equity,
      textClass: "text-foreground",
    },
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
          <div
            key={c.label}
            className="rounded border border-border bg-gda-panel p-3 space-y-1"
          >
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className={cn("text-base font-bold tabular-nums", c.textClass)}>
              {formatMoney(c.value)}
            </p>
          </div>
        ))}
      </div>

      {trend.length >= 2 && (
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Total Assets Trend
          </p>
          <SparkLine
            points={trend.map((r) => r.total_assets).reverse()}
            max={totalAssetsMax}
            color="var(--color-gda-cyan)"
          />
        </div>
      )}

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">
                Total Assets
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Total Liabilities
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Total Equity
              </th>
              <th className="px-3 py-2 text-right font-medium">Cash</th>
              <th className="px-3 py-2 text-right font-medium">AR</th>
              <th className="px-3 py-2 text-right font-medium">AP</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((r) => (
              <tr
                key={r.period}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-foreground">
                  {r.period}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoney(r.total_assets)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoney(r.total_liabilities)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoney(r.total_equity)}
                </td>
                <td className="px-3 py-2 text-right text-gda-cyan tabular-nums">
                  {formatMoney(r.cash)}
                </td>
                <td className="px-3 py-2 text-right text-gda-green tabular-nums">
                  {formatMoney(r.accounts_receivable)}
                </td>
                <td className="px-3 py-2 text-right text-amber-400 tabular-nums">
                  {formatMoney(r.accounts_payable)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
