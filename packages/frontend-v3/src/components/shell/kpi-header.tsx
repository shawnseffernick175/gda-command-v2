"use client";

import Link from "next/link";
import { useKpiHeader } from "@/hooks/use-kpi";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

type KpiMetricKey = "orders" | "sales" | "ebit" | "gross_margin" | "ros";

interface KpiItem {
  label: string;
  key: KpiMetricKey;
  definition: string;
  source: string;
  format: (v: number) => string;
}

const KPI_ITEMS: KpiItem[] = [
  {
    label: "Orders",
    key: "orders",
    definition: "Total contract value of awards received in the reporting period.",
    source: "USAspending.gov + captures",
    format: formatMoney,
  },
  {
    label: "Sales",
    key: "sales",
    definition: "Revenue recognized from active contracts.",
    source: "Financial planning system",
    format: formatMoney,
  },
  {
    label: "EBIT",
    key: "ebit",
    definition: "Earnings before interest and taxes.",
    source: "Derived: Sales − direct costs − overhead",
    format: formatMoney,
  },
  {
    label: "Gross Margin",
    key: "gross_margin",
    definition: "(Sales − COGS) / Sales × 100",
    source: "Financial planning system",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    label: "ROS",
    key: "ros",
    definition: "Return on Sales = Net Income / Sales × 100",
    source: "Derived from financial inputs",
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground hover:bg-gda-panel cursor-pointer"
                    aria-label={`Info about ${kpi.label}`}
                  />
                }
              >
                ?
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[220px]">
                <p className="font-bold uppercase">{kpi.label}</p>
                <p className="mt-1 leading-relaxed">{kpi.definition}</p>
                <p className="mt-1 opacity-70">
                  Source: {kpi.source}
                </p>
              </TooltipContent>
            </Tooltip>
          </span>
        );
      })}
    </div>
  );
}
