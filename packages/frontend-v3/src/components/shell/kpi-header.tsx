"use client";

import { useState } from "react";
import Link from "next/link";
import { useKpiHeader } from "@/hooks/use-kpi";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { ScoreExplain } from "@/components/shared/score-explainers";
import type { ScoreType, PeriodMode } from "@/components/shared/score-explainers";

type CalendarMode = "CY" | "FY";

type KpiMetricKey =
  | "orders"
  | "sales"
  | "gross_margin"
  | "ebit"
  | "ros"
  | "funded_backlog"
  | "backlog";

interface KpiTile {
  label: string;
  /** Optional explicit line breaks for the header label (spelled-out metrics). */
  labelLines?: string[];
  key: KpiMetricKey;
  scoreType: ScoreType;
  colorCoded: boolean;
  format: (v: number) => string;
}

const KPI_TILES: KpiTile[] = [
  { label: "Orders", key: "orders", scoreType: "orders", colorCoded: false, format: formatMoney },
  { label: "Sales", key: "sales", scoreType: "sales", colorCoded: false, format: formatMoney },
  { label: "Operating Income", labelLines: ["Operating", "Income"], key: "ebit", scoreType: "operating_income", colorCoded: true, format: formatMoney },
  { label: "Gross Margin", labelLines: ["Gross", "Margin"], key: "gross_margin", scoreType: "gross_margin", colorCoded: true, format: (v) => `${v.toFixed(1)}%` },
  { label: "Return on Sales", labelLines: ["Return on", "Sales"], key: "ros", scoreType: "ros", colorCoded: true, format: (v) => `${v.toFixed(1)}%` },
  { label: "Funded Backlog", labelLines: ["Funded", "Backlog"], key: "funded_backlog", scoreType: "funded_backlog", colorCoded: false, format: formatMoney },
  { label: "Backlog", key: "backlog", scoreType: "backlog", colorCoded: false, format: formatMoney },
];

function Divider() {
  return <div className="h-7 w-px shrink-0 bg-border" />;
}

export function KpiHeader() {
  const [mode, setMode] = useState<CalendarMode>("CY");
  const { data, isLoading, error } = useKpiHeader(mode);

  if (error) {
    return (
      <span className="text-[12px] text-muted-foreground italic whitespace-nowrap">
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
            "px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide rounded transition-colors",
            mode === "CY"
              ? "bg-fin-navy text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          CY
        </button>
        <button
          onClick={() => setMode("FY")}
          className={cn(
            "px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide rounded transition-colors",
            mode === "FY"
              ? "bg-fin-navy text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          FY
        </button>
        <span className="ml-1 text-[12px] text-foreground whitespace-nowrap">
          {data?.period ?? (mode === "CY" ? "CY to date" : "FY to date")}
        </span>
      </div>

      <Divider />

      {/* 7 KPI Tiles */}
      <div className="flex items-center gap-4 overflow-x-auto">
        {KPI_TILES.map((tile, idx) => {
          const item = data?.[tile.key];
          const value = item?.value;

          return (
            <div key={tile.key} className="flex items-center gap-4">
              <span className="relative inline-flex items-center gap-1 pr-5">
                <Link
                  href="/financials"
                  className="text-center whitespace-nowrap hover:opacity-80 transition-opacity"
                >
                  <div className="flex min-h-[2.4em] flex-col items-center justify-start text-[13px] font-semibold uppercase leading-tight tracking-[0.5px] text-foreground">
                    {(tile.labelLines ?? [tile.label]).map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                  </div>
                  {isLoading ? (
                    <div className="h-5 w-14 animate-pulse rounded bg-gda-skeleton mt-0.5" />
                  ) : (
                    <div
                      className={cn(
                        "text-base font-bold tabular-nums",
                        tile.colorCoded
                          ? (value != null && value >= 0 ? "text-gda-green-muted" : "text-gda-red")
                          : "text-foreground",
                      )}
                    >
                      {value != null ? tile.format(value) : "\u2014"}
                    </div>
                  )}
                </Link>
                <ScoreExplain
                  score={value != null ? tile.format(value) : null}
                  label={tile.label}
                  scoreType={tile.scoreType}
                  periodMode={mode as PeriodMode}
                  className="absolute top-0.5 right-0"
                />
              </span>
              {idx < KPI_TILES.length - 1 && <Divider />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
