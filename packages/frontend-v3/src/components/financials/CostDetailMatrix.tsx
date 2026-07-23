"use client";

import { useState } from "react";
import { useCostDetail } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const POOLS = ["DIRECT", "OH", "SMH", "G&A", "Total Cost"] as const;

export function CostDetailMatrix() {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { data, isLoading } = useCostDetail(selectedPeriod);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  const items = data?.items ?? [];

  if (items.length === 0 && !selectedPeriod) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No cost detail data yet. Upload TGT vs ACT workbooks to the Vault.
      </p>
    );
  }

  const periods = Array.from(new Set(items.map((i) => i.period))).sort();
  const activePeriod = selectedPeriod ?? periods[periods.length - 1] ?? null;
  const periodItems = activePeriod
    ? items.filter((i) => i.period === activePeriod)
    : items;

  const costElements = Array.from(
    new Set(periodItems.map((i) => i.cost_element)),
  );

  const lookup = new Map<string, typeof periodItems[number]>();
  for (const item of periodItems) {
    lookup.set(`${item.cost_element}|${item.pool}`, item);
  }

  return (
    <div className="space-y-3">
      {periods.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p === selectedPeriod ? null : p)}
              className={cn(
                "px-3 py-1 text-xs rounded border transition-colors",
                p === activePeriod
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-white text-ink hover:bg-bg",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {costElements.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No data for selected period
        </p>
      ) : (
        <div className="rounded border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-[12px] text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-medium">
                  Cost Element
                </th>
                {POOLS.map((pool) => (
                  <th
                    key={pool}
                    className="px-3 py-2 text-right font-medium"
                    colSpan={3}
                  >
                    {pool}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border bg-gda-bg-base text-[12px] text-muted-foreground">
                <th className="px-3 py-1" />
                {POOLS.map((pool) => (
                  <SubHeaders key={pool} />
                ))}
              </tr>
            </thead>
            <tbody>
              {costElements.map((ce) => (
                <tr
                  key={ce}
                  className="border-b border-border hover:bg-gda-panel/50"
                >
                  <td className="px-3 py-2 text-left text-foreground font-medium whitespace-nowrap">
                    {ce}
                  </td>
                  {POOLS.map((pool) => {
                    const item = lookup.get(`${ce}|${pool}`);
                    const variance = item?.variance_amount ?? 0;
                    return (
                      <CellGroup
                        key={pool}
                        target={item?.target_amount ?? 0}
                        actual={item?.actual_amount ?? 0}
                        variance={variance}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SubHeaders() {
  return (
    <>
      <th className="px-2 py-1 text-right font-normal">TGT</th>
      <th className="px-2 py-1 text-right font-normal">ACT</th>
      <th className="px-2 py-1 text-right font-normal">VAR</th>
    </>
  );
}

function CellGroup({
  target,
  actual,
  variance,
}: {
  target: number;
  actual: number;
  variance: number;
}) {
  return (
    <>
      <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
        {formatMoney(target)}
      </td>
      <td className="px-2 py-2 text-right text-foreground tabular-nums">
        {formatMoney(actual)}
      </td>
      <td
        className={cn(
          "px-2 py-2 text-right tabular-nums",
          variance > 0 ? "text-gda-red" : "text-gda-green-muted",
        )}
      >
        {formatMoney(variance)}
      </td>
    </>
  );
}
