"use client";

import Link from "next/link";
import { useKpiHeader } from "@/hooks/use-kpi";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { ScoreExplain } from "@/components/shared/score-explainers";
import type { ScoreType } from "@/components/shared/score-explainers";

type KpiMetricKey = "orders" | "sales" | "ebit" | "gross_margin" | "ros";

interface KpiItem {
  label: string;
  key: KpiMetricKey;
  scoreType: ScoreType;
  format: (v: number) => string;
}

const KPI_ITEMS: KpiItem[] = [
  {
    label: "Orders",
    key: "orders",
    scoreType: "orders",
    format: formatMoney,
  },
  {
    label: "Sales",
    key: "sales",
    scoreType: "sales",
    format: formatMoney,
  },
  {
    label: "EBIT",
    key: "ebit",
    scoreType: "ebit",
    format: formatMoney,
  },
  {
    label: "Gross Margin",
    key: "gross_margin",
    scoreType: "gross_margin",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    label: "ROS",
    key: "ros",
    scoreType: "ros",
    format: (v) => `${v.toFixed(1)}%`,
  },
];

export function KpiHeader() {
  const { data, isLoading, error } = useKpiHeader();

  if (error) {
    return (
      <span className="text-[11px] text-muted-foreground italic whitespace-nowrap">
        KPI header — pending Financial Bible integration
      </span>
    );
  }

  return (
    <div className="flex items-center gap-6 overflow-x-auto">
      {KPI_ITEMS.map((kpi) => {
        const item = data?.[kpi.key];
        const value = item?.value;
        const delta = item?.delta;

        return (
          <span key={kpi.key} className="inline-flex items-center gap-1">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[11px] text-muted-foreground">
                {kpi.label}
              </span>
              {isLoading ? (
                <span className="h-3 w-12 animate-pulse rounded bg-gda-panel" />
              ) : value != null ? (
                <>
                  <Link
                    href="/financials"
                    className="font-mono text-xs font-medium text-foreground tabular-nums hover:text-gda-green transition-colors cursor-pointer"
                  >
                    {kpi.format(value)}
                  </Link>
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
            <ScoreExplain
              score={value != null ? kpi.format(value) : null}
              label={kpi.label}
              scoreType={kpi.scoreType}
              inputs={{ delta }}
            />
          </span>
        );
      })}
    </div>
  );
}
