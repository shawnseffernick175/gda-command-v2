"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { opportunityHref } from "@/components/shared/OpportunityLink";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { stageKeyToLabel } from "@/lib/stages";
import {
  usePipelineCoverage,
  useSetPipelineAopTarget,
  type CoverageLayer,
  type CoveragePursuit,
} from "@/hooks/use-pipeline-coverage";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { StageAxisInfo } from "@/components/shared/StageAxisInfo";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const PURSUIT_SORT_COLS: ColumnSortConfig[] = [
  { field: "title", type: "string" },
  { field: "capture_value", type: "number" },
  { field: "stage", type: "string" },
  { field: "pwin", type: "number" },
  { field: "capture_owner", type: "string" },
];

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
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-xs font-bold uppercase text-muted-foreground tracking-wider">
            Pipeline Coverage
          </h2>
          <StageAxisInfo axis="coverage" />
        </div>
        <div className="flex gap-1">
          {FY_OPTIONS.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setFy(year)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[12px] transition-colors",
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
              <tr className="border-b border-border text-[12px] uppercase tracking-wider text-muted-foreground">
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

          {/* Source line + AOP target editor */}
          <div className="border-t border-border px-4 py-2 space-y-2">
            <AopTargetEditor fy={fy} aopTarget={data.aop_target} />
            <p className="font-mono text-[12px] italic text-muted-foreground">
              Required = AOP revenue target × layer multiple. Change the AOP target and every layer recomputes.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Inline editor for the fiscal year's AOP revenue target. Writing here updates
 * the single canonical value — the Financial Bible's monthly plan is re-derived
 * (annual ÷ 12) and every consumer reflects it immediately.
 */
function AopTargetEditor({ fy, aopTarget }: { fy: number; aopTarget: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const setTarget = useSetPipelineAopTarget();

  const start = () => {
    setDraft(String(aopTarget));
    setEditing(true);
  };

  const save = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return;
    setTarget.mutate(
      { fy, aop_revenue_target: n },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 font-mono text-[12px]">
        <span className="text-muted-foreground">FY{String(fy).slice(2)} AOP revenue target:</span>
        <span className="tabular-nums font-medium text-foreground">
          {formatMoney(aopTarget)}
        </span>
        <button
          type="button"
          onClick={start}
          className="rounded border border-border px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 font-mono text-[12px]">
      <span className="text-muted-foreground">FY{String(fy).slice(2)} AOP:</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-40 rounded border border-border bg-card px-2 py-1 text-foreground tabular-nums focus:border-gda-cyan focus:outline-none"
      />
      <button
        type="button"
        disabled={setTarget.isPending}
        onClick={save}
        className="rounded bg-gda-cyan px-2 py-1 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {setTarget.isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded border border-border px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        Cancel
      </button>
      {setTarget.isError && (
        <span className="text-gda-red">
          {setTarget.error instanceof Error ? setTarget.error.message : "Failed"}
        </span>
      )}
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
            <span className="text-[12px] text-muted-foreground">
              {isExpanded ? "▾" : "▸"}
            </span>
            {layer.label}
          </span>
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
          <span
            title={`AOP target × ${aopTarget > 0 ? +(layer.required_min / aopTarget).toFixed(2) : 0}×`}
          >
            {formatRequiredRange(layer.required_min, layer.required_max)}
          </span>
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-foreground tabular-nums">
          {formatMoney(layer.actual)}
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-foreground tabular-nums">
          <span title={`Required = AOP target × ${layer.multiple}. Covered ${layer.coverage.toFixed(2)}× so far.`}>
            {layer.multiple}×
          </span>
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
  const { sortBy, sortDir, handleSort } = useTableSort("covdrill");
  const sorted = useMemo(() => {
    if (sortBy) {
      return sortData(pursuits as unknown as Record<string, unknown>[], sortBy, sortDir, PURSUIT_SORT_COLS) as unknown as typeof pursuits;
    }
    return pursuits;
  }, [pursuits, sortBy, sortDir]);

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-[12px] uppercase tracking-wider text-muted-foreground">
          <SortableHeader label="Pursuit" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
          <SortableHeader label="Value" field="capture_value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
          <SortableHeader label="Stage" field="stage" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
          <SortableHeader label="Pwin" field="pwin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
          <SortableHeader label="Owner" field="capture_owner" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr
            key={p.pipeline_item_id}
            className="border-b border-border/50 hover:bg-gda-panel/30 transition-colors"
          >
            <td className="px-4 py-1.5 text-left">
              <Link
                href={opportunityHref(p.opportunity_id)}
                className="text-foreground hover:text-gda-green truncate block max-w-[280px]"
              >
                {p.title}
              </Link>
              {p.agency && (
                <span className="text-[12px] text-muted-foreground truncate block max-w-[280px]">
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
