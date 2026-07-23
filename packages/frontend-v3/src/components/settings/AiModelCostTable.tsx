"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Entry {
  task: string;
  provider: string;
  model: string;
  call_count: number;
  error_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
}

interface Resp {
  window: string;
  entries: Entry[];
  totals: { call_count: number; error_count: number; total_cost_usd: number };
  generated_at: string;
}

type Win = "live" | "1d" | "7d" | "30d";
type SK = keyof Entry;

const WINS: [Win, string][] = [["live", "Live"], ["1d", "24h"], ["7d", "7d"], ["30d", "30d"]];
const STR = new Set<string>(["task", "provider", "model"]);
const fmt = (n: number) => n.toLocaleString();
const fc = (n: number) => `$${n.toFixed(6)}`;

type Col = { h: string; k: SK; r: boolean; m?: boolean; fn: (e: Entry) => string };
const COLS: Col[] = [
  { h: "Task", k: "task", r: false, m: true, fn: (e) => e.task },
  { h: "Provider", k: "provider", r: false, fn: (e) => e.provider },
  { h: "Model", k: "model", r: false, m: true, fn: (e) => e.model },
  { h: "Calls", k: "call_count", r: true, fn: (e) => fmt(e.call_count) },
  { h: "Errors", k: "error_count", r: true, fn: (e) =>
    e.error_count === 0 ? "0" : `${fmt(e.error_count)} (${((e.error_count / e.call_count) * 100).toFixed(0)}%)` },
  { h: "Avg Latency", k: "avg_latency_ms", r: true, fn: (e) => `${fmt(e.avg_latency_ms)} ms` },
  { h: "Tokens In", k: "total_tokens_input", r: true, fn: (e) => fmt(e.total_tokens_input) },
  { h: "Tokens Out", k: "total_tokens_output", r: true, fn: (e) => fmt(e.total_tokens_output) },
  { h: "Est. Cost", k: "total_cost_usd", r: true, m: true, fn: (e) => fc(e.total_cost_usd) },
];

export function AiModelCostTable() {
  const [win, setWin] = useState<Win>("live");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["llm-cost-rollup", win],
    queryFn: () => apiGet<Resp>("/v3/llm-cost-rollup", { window: win }),
    refetchInterval: win === "live" ? 30_000 : false,
  });
  const [sk, setSk] = useState<SK>("task");
  const [sd, setSd] = useState<"asc" | "desc">("asc");

  function onSort(key: SK) {
    if (sk === key) setSd((d) => (d === "asc" ? "desc" : "asc"));
    else { setSk(key); setSd(STR.has(key) ? "asc" : "desc"); }
  }

  const rows = (() => {
    const arr = data?.entries ? [...data.entries] : [];
    if (!arr.length) return arr;
    arr.sort((a, b) => {
      const av = a[sk], bv = b[sk];
      const c = typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv) : (av as number) - (bv as number);
      return sd === "asc" ? c : -c;
    });
    return arr;
  })();

  const H = "px-3 py-2 font-medium cursor-pointer select-none";
  const C = "px-3 py-2 text-xs tabular-nums";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {WINS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setWin(v)} className={cn(
              "rounded border px-2.5 py-1 text-[12px] font-mono",
              win === v ? "border-gda-cyan bg-gda-cyan/10 text-gda-cyan" : "border-border text-muted-foreground",
            )}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data?.generated_at && (
            <span className="text-[12px] text-muted-foreground font-mono">
              Updated {new Date(data.generated_at).toLocaleTimeString()}
            </span>
          )}
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={cn(
            "rounded border border-border px-2.5 py-1 text-[12px] font-mono text-muted-foreground",
            isFetching && "opacity-50",
          )}>Refresh</button>
        </div>
      </div>

      <div className="rounded border border-border bg-gda-bg-base px-3 py-2">
        <p className="text-[12px] text-muted-foreground">
          Anthropic cost metering fix in progress (#964); those rows may show $0.00.
        </p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No calls in this window.</p>
      ) : (
        <div className="rounded border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wide text-muted-foreground">
                {COLS.map((c) => (
                  <th key={c.k} className={cn(H, c.r ? "text-right" : "text-left")} onClick={() => onSort(c.k)}>
                    {c.h}{sk === c.k && <span className="ml-1">{sd === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={`${e.task}-${e.model}-${i}`} className="border-b border-border">
                  {COLS.map((c) => {
                    const err = c.k === "error_count" && e.error_count > 0;
                    return (
                      <td key={c.k} className={cn(C, c.r ? "text-right" : "text-left",
                        err ? "text-gda-red font-semibold" : c.m ? "text-foreground" : "text-muted-foreground",
                        c.m && "font-mono")}>{c.fn(e)}</td>
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
