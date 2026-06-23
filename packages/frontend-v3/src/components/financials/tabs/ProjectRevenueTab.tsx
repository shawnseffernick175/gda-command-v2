"use client";

import { useProjectRevenue } from "@/hooks/use-financial-bible";
import { formatMoney } from "@/lib/format-money";

export function ProjectRevenueTab() {
  const { data, isLoading } = useProjectRevenue();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Project revenue data not yet ingested. Upload a Full Proj Revenue
        Summary to populate.
      </p>
    );
  }

  const totalRevenue = items.reduce((s, r) => s + r.revenue, 0);
  const totalCost = items.reduce((s, r) => s + r.cost, 0);
  const totalProfit = items.reduce((s, r) => s + r.profit, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} project{items.length !== 1 ? "s" : ""} &middot;
          Revenue {formatMoney(totalRevenue)} &middot; Profit{" "}
          {formatMoney(totalProfit)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Total Revenue</p>
          <p className="text-base font-bold tabular-nums text-gda-green">
            {formatMoney(totalRevenue)}
          </p>
        </div>
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Total Cost</p>
          <p className="text-base font-bold tabular-nums text-amber-400">
            {formatMoney(totalCost)}
          </p>
        </div>
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Total Profit</p>
          <p className="text-base font-bold tabular-nums text-foreground">
            {formatMoney(totalProfit)}
          </p>
        </div>
      </div>

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Contract #</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Profit</th>
              <th className="px-3 py-2 text-right font-medium">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-foreground">
                  {r.period}
                </td>
                <td className="px-3 py-2 text-left text-foreground">
                  {r.project_name}
                </td>
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {r.contract_number ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-gda-green tabular-nums">
                  {formatMoney(r.revenue)}
                </td>
                <td className="px-3 py-2 text-right text-amber-400 tabular-nums">
                  {formatMoney(r.cost)}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoney(r.profit)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                  {r.margin_pct != null ? `${r.margin_pct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
