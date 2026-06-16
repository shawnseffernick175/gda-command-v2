"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { stageKeyToLabel } from "@/lib/stages";
import {
  usePipelineCoverage,
  type CoverageLayer,
  type CoveragePursuit,
} from "@/hooks/use-pipeline-coverage";

const FY_OPTIONS = [2026, 2027, 2028] as const;

const STATUS_DOT: Record<string, string> = {
  green: "bg-gda-green",
  yellow: "bg-gda-amber",
  red: "bg-gda-red",
};

function formatRequiredRange(min: number, max: number | null): string {
  if (max != null) return `${formatMoney(min)}–${formatMoney(max)}`;
  if (min > 0) return formatMoney(min);
  return "—";
}

function formatPwinPct(pwin: number): string {
  return `${Math.round(pwin * 100)}%`;
}

export function PipelineCoverageCard() {
  const [fy, setFy] = useState<number>(2026);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const { data, isLoading } = usePipelineCoverage(fy);

  return (
    <div className="rounded border border-border bg-gda-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-mono text-xs font-bold uppercase text-muted-foreground tracking-wider">
          Pipeline Coverage — Shipley Model
        </h2>
        <div className="flex gap-1">
          {FY_OPTIONS.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setFy(year)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
                fy === year
                  ? "bg-gda-cyan text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              FY{String(year).slice(2)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 bg-gda-bg-base" />
          ))}
        </div>
      ) : data ? (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Layer</th>
                <th className="px-4 py-2 text-right font-medium">Required</th>
                <th className="px-4 py-2 text-right font-medium">Actual</th>
                <th className="px-4 py-2 text-right font-medium">Multiple</th>
                <th className="px-4 py-2 text-center font-medium w-[48px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.layers.map((layer) => (
                <CoverageRow
                  key={layer.key}
                  layer={layer}
                  aopTarget={data.aop_target}
                  isExpanded={expandedLayer === layer.key}
                  onToggle={() =>
                    setExpandedLayer(
                      expandedLayer === layer.key ? null : layer.key,
                    )
                  }
                />
              ))}
            </tbody>
          </table>

          {/* Source line */}
          <div className="border-t border-border px-4 py-2">
            <p className="font-mono text-[11px] italic text-muted-foreground">
              Source: Shipley Capture Management Lifecycle. Required = AOP revenue target × layer multiple.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CoverageRow({
  layer,
  aopTarget,
  isExpanded,
  onToggle,
}: {
  layer: CoverageLayer;
  aopTarget: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border hover:bg-gda-bg-base/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2 text-left font-mono text-xs text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {isExpanded ? "▾" : "▸"}
            </span>
            {layer.label}
          </span>
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
          <span
            title={`AOP × ${layer.key === "pwin_weighted" ? "≥1" : layer.required_max != null ? `${(layer.required_min / aopTarget).toFixed(1)}–${(layer.required_max / aopTarget).toFixed(0)}` : `${(layer.required_min / aopTarget).toFixed(0)}`}×`}
          >
            {layer.key === "pwin_weighted"
              ? `≥${formatMoney(layer.required_min)}`
              : formatRequiredRange(layer.required_min, layer.required_max)}
          </span>
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-foreground tabular-nums">
          {formatMoney(layer.actual)}
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-foreground tabular-nums">
          {layer.multiple.toFixed(1)}×
        </td>
        <td className="px-4 py-2 text-center">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              STATUS_DOT[layer.status],
            )}
            title={layer.status === "green" ? "On track" : layer.status === "yellow" ? "Warning (0.8–1.0×)" : "Under-coveraged (<0.8×)"}
          />
        </td>
      </tr>

      {/* Drilldown */}
      {isExpanded && layer.pursuits.length > 0 && (
        <tr>
          <td colSpan={5} className="bg-gda-bg-deep px-0 py-0">
            <DrilldownTable pursuits={layer.pursuits} />
          </td>
        </tr>
      )}
      {isExpanded && layer.pursuits.length === 0 && (
        <tr>
          <td
            colSpan={5}
            className="bg-gda-bg-deep px-4 py-3 text-center font-mono text-xs text-muted-foreground"
          >
            No pursuits in this layer.
          </td>
        </tr>
      )}
    </>
  );
}

function DrilldownTable({ pursuits }: { pursuits: CoveragePursuit[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-1.5 text-left font-medium">Pursuit</th>
          <th className="px-4 py-1.5 text-right font-medium">Value</th>
          <th className="px-4 py-1.5 text-left font-medium">Stage</th>
          <th className="px-4 py-1.5 text-right font-medium">Pwin</th>
          <th className="px-4 py-1.5 text-left font-medium">Owner</th>
        </tr>
      </thead>
      <tbody>
        {pursuits.map((p) => (
          <tr
            key={p.pipeline_item_id}
            className="border-b border-border/50 hover:bg-gda-panel/30 transition-colors"
          >
            <td className="px-4 py-1.5 text-left">
              <Link
                href={`/opportunities?id=${p.opportunity_id}`}
                className="text-foreground hover:text-gda-green truncate block max-w-[280px]"
              >
                {p.title}
              </Link>
              {p.agency && (
                <span className="text-[11px] text-muted-foreground truncate block max-w-[280px]">
                  {p.agency}
                </span>
              )}
            </td>
            <td className="px-4 py-1.5 text-right font-mono text-foreground tabular-nums">
              {formatMoney(p.capture_value)}
            </td>
            <td className="px-4 py-1.5 text-left font-mono text-muted-foreground">
              {stageKeyToLabel(p.stage)}
            </td>
            <td className="px-4 py-1.5 text-right font-mono text-foreground tabular-nums">
              {formatPwinPct(p.pwin)}
            </td>
            <td className="px-4 py-1.5 text-left text-muted-foreground truncate max-w-[120px]">
              {p.capture_owner}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
