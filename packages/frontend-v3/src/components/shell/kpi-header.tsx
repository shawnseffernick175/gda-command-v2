"use client";

import { useState } from "react";
import Link from "next/link";
import { useKpiHeader } from "@/hooks/use-kpi";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type CalendarMode = "CY" | "FY";

type KpiMetricKey =
  | "orders"
  | "sales"
  | "ebit"
  | "ros"
  | "funded_backlog"
  | "backlog";

interface KpiTile {
  label: string;
  key: KpiMetricKey;
  color: "navy" | "green";
  format: (v: number) => string;
}

const KPI_TILES: KpiTile[] = [
  { label: "ORDERS", key: "orders", color: "navy", format: formatMoney },
  { label: "SALES", key: "sales", color: "navy", format: formatMoney },
  { label: "EBIT", key: "ebit", color: "green", format: formatMoney },
  {
    label: "ROS",
    key: "ros",
    color: "green",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    label: "FUNDED BACKLOG",
    key: "funded_backlog",
    color: "navy",
    format: formatMoney,
  },
  { label: "BACKLOG", key: "backlog", color: "navy", format: formatMoney },
];

const KPI_DEFINITIONS: Record<string, string> = {
  ORDERS:
    "The total value of new contract awards, task orders, and option exercises booked during a given period.",
  SALES:
    "Revenue recognized for work actually performed and billed during a given period.",
  EBIT: "Earnings Before Interest and Taxes, calculated as revenue minus all direct and indirect operating costs.",
  ROS: "Return on Sales, calculated as EBIT divided by Sales and expressed as a percentage.",
  "FUNDED BACKLOG":
    "Total funded value remaining on active task orders (real data only).",
  BACKLOG:
    "Total ceiling value (funded + unfunded) of active task orders (real data only).",
};

function Divider() {
  return <div className="h-7 w-px shrink-0 bg-gray-200" />;
}

export function KpiHeader() {
  const [mode, setMode] = useState<CalendarMode>("CY");
  const { data, isLoading, error } = useKpiHeader(mode);

  if (error) {
    return (
      <span className="text-[11px] text-muted-foreground italic whitespace-nowrap">
        KPI header — pending Financial Bible integration
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* CY/FY Toggle */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setMode("CY")}
          className={cn(
            "px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded transition-colors",
            mode === "CY"
              ? "bg-fin-navy text-white"
              : "text-gray-400 hover:text-gray-200",
          )}
        >
          CY
        </button>
        <button
          onClick={() => setMode("FY")}
          className={cn(
            "px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded transition-colors",
            mode === "FY"
              ? "bg-fin-navy text-white"
              : "text-gray-400 hover:text-gray-200",
          )}
        >
          FY
        </button>
        <span className="ml-1 text-[11px] text-gray-500 whitespace-nowrap">
          {data?.period ?? (mode === "CY" ? "CY to date" : "FY to date")}
        </span>
      </div>

      <Divider />

      {/* 6 KPI Tiles */}
      <div className="flex items-center gap-4 overflow-x-auto">
        {KPI_TILES.map((tile, idx) => {
          const item = data?.[tile.key];
          const value = item?.value;

          return (
            <div key={tile.key} className="flex items-center gap-4">
              <Link
                href="/financials"
                className="text-center whitespace-nowrap hover:opacity-80 transition-opacity"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[1px] text-gray-500">
                  {tile.label}
                </div>
                {isLoading ? (
                  <div className="h-5 w-14 animate-pulse rounded bg-gda-panel mt-0.5" />
                ) : (
                  <div
                    className={cn(
                      "text-base font-bold tabular-nums",
                      tile.color === "navy"
                        ? "text-fin-navy"
                        : "text-fin-chart-green",
                    )}
                  >
                    {value != null ? tile.format(value) : "\u2014"}
                  </div>
                )}
              </Link>
              {idx < KPI_TILES.length - 1 && <Divider />}
            </div>
          );
        })}
      </div>

      {/* Info tooltip */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="ml-2 shrink-0 text-gray-500 hover:text-gray-300 transition-colors text-sm cursor-pointer">
            &#9432;
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            className="max-w-sm bg-gda-panel border border-border p-3"
          >
            <div className="font-bold text-fin-navy text-xs mb-2">
              KPI Definitions
            </div>
            <div className="space-y-1.5">
              {Object.entries(KPI_DEFINITIONS).map(([label, definition]) => (
                <div key={label} className="text-[11px] leading-relaxed">
                  <span className="font-bold text-fin-navy">{label}:</span>{" "}
                  <span className="text-muted-foreground">{definition}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
