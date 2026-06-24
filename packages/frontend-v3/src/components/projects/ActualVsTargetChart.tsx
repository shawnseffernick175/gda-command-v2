"use client";

import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

interface BarPair {
  label: string;
  actual: number;
  target: number;
}

export function ActualVsTargetChart({ project }: { project: ProjectFullRow }) {
  const pairs: BarPair[] = [
    { label: "Period Costs", actual: project.actual_period_costs, target: project.target_period_costs },
    { label: "Period Profit", actual: project.actual_period_profit, target: project.target_period_profit },
    { label: "Period Revenue", actual: project.actual_period_revenue, target: project.target_period_revenue },
    { label: "YTD Costs", actual: project.actual_ytd_costs, target: project.target_ytd_costs },
    { label: "YTD Profit", actual: project.actual_ytd_profit, target: project.target_ytd_profit },
    { label: "YTD Revenue", actual: project.actual_ytd_revenue, target: project.target_ytd_revenue },
  ];

  const hasData = pairs.some((p) => p.actual !== 0 || p.target !== 0);
  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No actual vs target data for this period yet</p>
      </div>
    );
  }

  const maxVal = Math.max(...pairs.flatMap((p) => [Math.abs(p.actual), Math.abs(p.target)]), 1);

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-fin-ink">Actual vs Target</h3>
      <div className="space-y-3">
        {pairs.map((p) => {
          const actualPct = (Math.abs(p.actual) / maxVal) * 100;
          const targetPct = (Math.abs(p.target) / maxVal) * 100;
          return (
            <div key={p.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{p.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatMoney(p.actual)} / {formatMoney(p.target)}
                </span>
              </div>
              <div className="flex gap-1">
                <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-fin-sand/30">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-fin-teal transition-all"
                    style={{ width: `${actualPct}%` }}
                  />
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-fin-sand/30">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-fin-sand transition-all"
                    style={{ width: `${targetPct}%` }}
                  />
                </div>
              </div>
              <div className="mt-0.5 flex gap-1 text-[11px]">
                <span className="flex-1 text-fin-teal">Actual</span>
                <span className="flex-1 text-fin-stone">Target</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm bg-fin-teal")} />
          Actual
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm bg-fin-sand")} />
          Target
        </span>
      </div>
    </div>
  );
}
