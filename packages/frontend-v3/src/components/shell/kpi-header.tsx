"use client";

import { useKpiHeader } from "@/hooks/use-kpi";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { ScoreTooltip } from "@/components/shared/score-tooltip";
import type { KpiHeaderData } from "@/lib/types";

interface KpiItem {
  label: string;
  key: keyof KpiHeaderData;
  explanation: string;
  format: (v: number) => string;
}

const KPI_ITEMS: KpiItem[] = [
  {
    label: "Orders",
    key: "orders",
    explanation: "New contract awards booked in the current period",
    format: formatMoney,
  },
  {
    label: "Sales",
    key: "sales",
    explanation: "Revenue recognized in the current period",
    format: formatMoney,
  },
  {
    label: "EBIT",
    key: "ebit",
    explanation: "Earnings Before Interest and Taxes",
    format: formatMoney,
  },
  {
    label: "Gross Margin",
    key: "gross_margin",
    explanation: "Gross profit as a percentage of sales",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    label: "ROS",
    key: "ros",
    explanation: "Return on Sales (EBIT / Sales)",
    format: (v) => `${v.toFixed(1)}%`,
  },
];

export function KpiHeader() {
  const { data, isLoading, error } = useKpiHeader();

  if (error) {
    return (
      <div className="flex h-9 items-center border-b border-border bg-gda-bg-base px-4">
        <span className="text-[11px] text-muted-foreground italic">
          KPI header — pending Financial Bible integration
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center gap-6 border-b border-border bg-gda-bg-base px-4 overflow-x-auto">
      {KPI_ITEMS.map((kpi) => {
        const item = data?.[kpi.key];
        const value = item?.value;
        const delta = item?.delta;

        return (
          <ScoreTooltip
            key={kpi.key}
            label={kpi.label}
            explanation={kpi.explanation}
            score={value != null ? kpi.format(value) : undefined}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[11px] text-muted-foreground">
                {kpi.label}
              </span>
              {isLoading ? (
                <span className="h-3 w-12 animate-pulse rounded bg-gda-panel" />
              ) : value != null ? (
                <>
                  <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                    {kpi.format(value)}
                  </span>
                  {delta != null && (
                    <span
                      className={cn(
                        "font-mono text-[11px] tabular-nums",
                        delta >= 0 ? "text-gda-green-muted" : "text-gda-red",
                      )}
                    >
                      {delta >= 0 ? "▲" : "▼"}
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">—</span>
              )}
            </div>
          </ScoreTooltip>
        );
      })}
    </div>
  );
}
