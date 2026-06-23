"use client";

import { useState } from "react";
import {
  useLlmCostRollup,
  type CostWindow,
  type CostRollupEntry,
} from "@/hooks/use-llm-cost-rollup";
import { cn } from "@/lib/utils";

type SortKey = keyof CostRollupEntry;
type SortDir = "asc" | "desc";

const WINDOWS: [CostWindow, string][] = [
  ["live", "Live"],
  ["1d", "24h"],
  ["7d", "7d"],
  ["30d", "30d"],
];

const S = new Set<string>(["task", "provider", "model"]);
const fmt = (n: number) => n.toLocaleString("en-US");
const fc = (n: number) => `$${n.toFixed(6)}`;

type Col = { h: string; k: SortKey; r: boolean; mono?: boolean; fn: (e: CostRollupEntry) => string };
const COLS: Col[] = [
  { h: "Task", k: "task", r: false, mono: true, fn: (e) => e.task },
  { h: "Provider", k: "provider", r: false, fn: (e) => e.provider },
  { h: "Model", k: "model", r: false, mono: true, fn: (e) => e.model },
  { h: "Calls", k: "call_count", r: true, fn: (e) => fmt(e.call_count) },
  { h: "Errors", k: "error_count", r: true, fn: (e) =>
    e.error_count === 0 ? "0" : `${fmt(e.error_count)} (${((e.error_count / e.call_count) * 100).toFixed(0)}%)` },
  { h: "Avg Latency", k: "avg_latency_ms", r: true, fn: (e) => `${fmt(e.avg_latency_ms)} ms` },
  { h: "Tokens In", k: "total_tokens_input", r: true, fn: (e) => fmt(e.total_tokens_input) },
  { h: "Tokens Out", k: "total_tokens_output", r: true, fn: (e) => fmt(e.total_tokens_output) },
  { h: "Est. Cost", k: "total_cost_usd", r: true, mono: true, fn: (e) => fc(e.total_cost_usd) },
];

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString();

export function AiModelCostTable() {
  const [window, setWindow] = useState<CostWindow>("live");
  const { data, isLoading, refetch, isFetching } = useLlmCostRollup(window);
  const [sortKey, setSortKey] = useState<SortKey>("task");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(S.has(key) ? "asc" : "desc");
    }
  }

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

  const H = "px-3 py-2 font-medium cursor-pointer select-none";
  const C = "px-3 py-2 text-xs tabular-nums";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {WINDOWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setWindow(v)}
              className={cn(
                "rounded border px-2.5 py-1 text-[11px] font-mono",
                window === v
                  ? "border-gda-cyan bg-gda-cyan/10 text-gda-cyan"
                  : "border-border text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data?.generated_at && (
            <span className="text-[11px] text-muted-foreground font-mono">
              Updated {fmtTime(data.generated_at)}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              "rounded border border-border px-2.5 py-1 text-[11px] font-mono text-muted-foreground",
              isFetching && "opacity-50",
            )}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded border border-border bg-gda-bg-base px-3 py-2">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Anthropic cost metering fix in progress (#964); those rows may show $0.00.
        </p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No calls in this window.
        </p>
      ) : (
        <div className="rounded border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wide text-muted-foreground">
                {COLS.map((c) => (
                  <th
                    key={c.k}
                    className={cn(H, c.r ? "text-right" : "text-left")}
                    onClick={() => handleSort(c.k)}
                  >
                    {c.h}
                    {sortKey === c.k && (
                      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => (
                <tr
                  key={`${entry.task}-${entry.model}-${idx}`}
                  className="border-b border-border"
                >
                  {COLS.map((c) => {
                    const isErr = c.k === "error_count" && entry.error_count > 0;
                    return (
                      <td
                        key={c.k}
                        className={cn(
                          C,
                          c.r ? "text-right" : "text-left",
                          isErr ? "text-gda-red font-semibold" : c.mono ? "text-foreground" : "text-muted-foreground",
                          c.mono && "font-mono",
                        )}
                      >
                        {c.fn(entry)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {data?.totals && (
              <tfoot>
                <tr className="border-t border-border bg-gda-bg-base">
                  <td colSpan={3} className={cn(C, "font-semibold text-foreground")}>Totals</td>
                  <td className={cn(C, "text-right font-semibold text-foreground")}>{fmt(data.totals.call_count)}</td>
                  <td className={cn(C, "text-right font-semibold", data.totals.error_count > 0 ? "text-gda-red" : "text-muted-foreground")}>{fmt(data.totals.error_count)}</td>
                  <td colSpan={3} />
                  <td className={cn(C, "text-right font-semibold text-foreground font-mono")}>{fc(data.totals.total_cost_usd)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
