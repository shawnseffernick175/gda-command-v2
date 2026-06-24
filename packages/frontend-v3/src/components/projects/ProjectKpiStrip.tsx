"use client";

import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

interface KpiItem {
  label: string;
  actual: number;
  target: number | null;
  format: "money" | "pct";
}

function buildKpis(p: ProjectFullRow): KpiItem[] {
  return [
    { label: "ITD Value", actual: p.itd_value, target: null, format: "money" },
    { label: "ITD Billed", actual: p.itd_billed_amount, target: null, format: "money" },
    { label: "Open AR", actual: p.open_ar, target: null, format: "money" },
    {
      label: "Period Revenue",
      actual: p.actual_period_revenue,
      target: p.target_period_revenue,
      format: "money",
    },
    {
      label: "Period Profit",
      actual: p.actual_period_profit,
      target: p.target_period_profit,
      format: "money",
    },
    {
      label: "Profit Margin %",
      actual: p.margin_pct ?? 0,
      target:
        p.target_period_revenue > 0
          ? (p.target_period_profit / p.target_period_revenue) * 100
          : null,
      format: "pct",
    },
  ];
}

function formatVal(v: number, fmt: "money" | "pct"): string {
  if (fmt === "pct") return `${v.toFixed(1)}%`;
  return formatMoney(v);
}

export function ProjectKpiStrip({ project }: { project: ProjectFullRow }) {
  const kpis = buildKpis(project);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((kpi) => {
        const delta =
          kpi.target != null && kpi.target !== 0
            ? kpi.actual - kpi.target
            : null;
        const positive = delta != null && delta >= 0;
        const negative = delta != null && delta < 0;

        return (
          <div
            key={kpi.label}
            className="rounded border border-border bg-gda-panel p-4"
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatVal(kpi.actual, kpi.format)}
            </p>
            {delta != null && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  positive && "text-gda-green",
                  negative && "text-gda-red",
                )}
              >
                {positive ? "+" : ""}
                {kpi.format === "pct"
                  ? `${delta.toFixed(1)}pp vs target`
                  : `${formatMoney(delta)} vs target`}
              </p>
            )}
            {kpi.target != null && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Target: {formatVal(kpi.target, kpi.format)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
