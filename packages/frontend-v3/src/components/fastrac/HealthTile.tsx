"use client";

import { useFTHealth, type FTSourceStat } from "@/hooks/use-fastrac-signals";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<FTSourceStat["status"], { label: string; className: string }> = {
  producing: { label: "producing", className: "bg-gda-green/15 border-gda-green/40 text-gda-green" },
  quiet: { label: "quiet", className: "bg-amber-400/15 border-amber-400/40 text-amber-400" },
  stale: { label: "stale", className: "bg-red-500/15 border-red-500/40 text-red-400" },
};

function HealthStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-border bg-gda-panel/40 p-3">
      <p className="text-[12px] font-mono uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold text-foreground">{value}</p>
      {sub ? <p className="text-[12px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleDateString();
}

export function HealthTile() {
  const { data, isLoading, isError } = useFTHealth();

  if (isLoading) {
    return <p className="text-[12px] text-muted-foreground">Loading FasTrac health…</p>;
  }
  if (isError || !data) {
    return <p className="text-[12px] text-red-400">FasTrac health unavailable.</p>;
  }

  const { pipelines, sources, matches } = data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthStat
          label="Tech signals"
          value={pipelines.tech.total}
          sub={`+${pipelines.tech.last_7d} in 7d`}
        />
        <HealthStat
          label="Requirement signals"
          value={pipelines.requirement.total}
          sub={`+${pipelines.requirement.last_7d} in 7d`}
        />
        <HealthStat
          label="Matches generated"
          value={matches.total}
          sub={`+${matches.last_7d} in 7d · last ${fmtDate(matches.newest_computed_at)}`}
        />
        <HealthStat
          label="Unsourced signals"
          value={pipelines.tech.null_source + pipelines.requirement.null_source}
          sub="must be 0 (R1)"
        />
      </div>

      <div>
        <p className="mb-2 text-[12px] font-mono font-semibold uppercase tracking-wide text-foreground/80">
          Source adapters ({sources.length})
        </p>
        {sources.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No signals ingested yet — no adapter has produced data.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-mono font-medium">Source</th>
                  <th className="py-1.5 pr-3 font-mono font-medium">Pipeline</th>
                  <th className="py-1.5 pr-3 font-mono font-medium text-right">Total</th>
                  <th className="py-1.5 pr-3 font-mono font-medium text-right">7 days</th>
                  <th className="py-1.5 pr-3 font-mono font-medium">Newest</th>
                  <th className="py-1.5 font-mono font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={`${s.pipeline}:${s.source}`} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-foreground">{s.source}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{s.pipeline}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-foreground">{s.total}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground">{s.last_7d}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{fmtDate(s.newest_ingested_at)}</td>
                    <td className="py-1.5">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[12px] uppercase",
                          STATUS_STYLE[s.status].className,
                        )}
                      >
                        {STATUS_STYLE[s.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
