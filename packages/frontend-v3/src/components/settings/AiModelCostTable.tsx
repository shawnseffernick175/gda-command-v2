"use client";

import { useState, useCallback } from "react";
import {
  useLlmCostRollup,
  type CostWindow,
  type CostRollupEntry,
} from "@/hooks/use-llm-cost-rollup";
import { cn } from "@/lib/utils";

const WINDOWS: { value: CostWindow; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "1d", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

type SortKey =
  | "task"
  | "provider"
  | "model"
  | "call_count"
  | "error_count"
  | "avg_latency_ms"
  | "total_tokens_input"
  | "total_tokens_output"
  | "total_cost_usd";

type SortDir = "asc" | "desc";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCost(n: number): string {
  return `$${n.toFixed(6)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " ET";
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-1">{currentDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );
}

export function AiModelCostTable() {
  const [window, setWindow] = useState<CostWindow>("live");
  const { data, isLoading, refetch, isFetching } = useLlmCostRollup(window);

  const [sortKey, setSortKey] = useState<SortKey>("task");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "task" || key === "provider" || key === "model" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  const sorted = (() => {
    const entries = data?.entries ? [...data.entries] : [];
    if (entries.length === 0) return [];
    entries.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const diff = (av as number) - (bv as number);
      return sortDir === "asc" ? diff : -diff;
    });
    return entries;
  })();

  function errorDisplay(entry: CostRollupEntry) {
    if (entry.error_count === 0) return "0";
    const rate = ((entry.error_count / entry.call_count) * 100).toFixed(0);
    return `${formatNumber(entry.error_count)} (${rate}%)`;
  }

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => setWindow(w.value)}
              className={cn(
                "rounded border px-2.5 py-1 text-[11px] font-mono transition-colors",
                window === w.value
                  ? "border-gda-cyan bg-gda-cyan/10 text-gda-cyan"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-gda-bg-base",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data?.generated_at && (
            <span className="text-[11px] text-muted-foreground font-mono">
              Updated {formatTimestamp(data.generated_at)}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              "rounded border border-border px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-gda-bg-base transition-colors",
              isFetching && "opacity-50",
            )}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Cost honesty banner */}
      <div className="rounded border border-border bg-gda-bg-base px-3 py-2">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Cost reflects metered spend. Anthropic per-call cost metering is being
          fixed (see #964); until then Anthropic rows may show $0.00.
        </p>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gda-bg-base" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No LLM calls recorded in this window.
        </p>
      ) : (
        <div className="rounded border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <SortableHeader label="Task" sortKey="task" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Provider" sortKey="provider" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Model" sortKey="model" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Calls" sortKey="call_count" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Errors" sortKey="error_count" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Avg Latency" sortKey="avg_latency_ms" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Tokens In" sortKey="total_tokens_input" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Tokens Out" sortKey="total_tokens_output" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortableHeader label="Est. Cost (USD)" sortKey="total_cost_usd" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => (
                <tr
                  key={`${entry.task}-${entry.provider}-${entry.model}-${idx}`}
                  className="border-b border-border"
                >
                  <td className="px-3 py-2 text-xs text-foreground font-mono">
                    {entry.task}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {entry.provider}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                    {entry.model}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground text-right tabular-nums">
                    {formatNumber(entry.call_count)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-xs text-right tabular-nums",
                      entry.error_count > 0
                        ? "text-gda-red font-semibold"
                        : "text-muted-foreground",
                    )}
                  >
                    {errorDisplay(entry)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground text-right tabular-nums">
                    {formatNumber(entry.avg_latency_ms)} ms
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground text-right tabular-nums">
                    {formatNumber(entry.total_tokens_input)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground text-right tabular-nums">
                    {formatNumber(entry.total_tokens_output)}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground text-right tabular-nums font-mono">
                    {formatCost(entry.total_cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Footer totals */}
            {data?.totals && (
              <tfoot>
                <tr className="border-t border-border bg-gda-bg-base">
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-xs font-semibold text-foreground"
                  >
                    Totals
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-foreground text-right tabular-nums">
                    {formatNumber(data.totals.call_count)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-xs font-semibold text-right tabular-nums",
                      data.totals.error_count > 0
                        ? "text-gda-red"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatNumber(data.totals.error_count)}
                  </td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-xs font-semibold text-foreground text-right tabular-nums font-mono">
                    {formatCost(data.totals.total_cost_usd)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
