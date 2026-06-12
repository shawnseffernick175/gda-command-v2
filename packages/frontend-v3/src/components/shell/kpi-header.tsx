"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useKpiHeader } from "@/hooks/use-kpi";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

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

function KpiPopover({ kpi, onClose }: { kpi: KpiItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-2 bg-gda-panel border border-border rounded p-3 text-xs font-mono max-w-[220px] shadow-lg"
    >
      <p className="font-bold text-foreground uppercase">{kpi.label}</p>
      <p className="mt-1 text-muted-foreground leading-relaxed">{kpi.definition}</p>
      <p className="mt-2 text-muted-foreground">
        Source: <span className="text-foreground">{kpi.source}</span>
      </p>
    </div>
  );
}

export function KpiHeader() {
  const { data, isLoading, error } = useKpiHeader();
  const [openPopover, setOpenPopover] = useState<string | null>(null);

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
          <span key={kpi.key} className="relative inline-flex items-center gap-1">
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
            <button
              type="button"
              onClick={() => setOpenPopover(openPopover === kpi.key ? null : kpi.key)}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground hover:bg-gda-panel cursor-pointer"
              aria-label={`Info about ${kpi.label}`}
            >
              ?
            </button>
            {openPopover === kpi.key && (
              <KpiPopover kpi={kpi} onClose={() => setOpenPopover(null)} />
            )}
          </span>
        );
      })}
    </div>
  );
}
