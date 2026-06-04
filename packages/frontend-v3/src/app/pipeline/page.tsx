"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useOpportunities } from "@/hooks/use-opportunities";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";
import type { Band, OpportunitySummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_BANDS: Band[] = ["forecast", "signal", "discovery", "pass"];
const DEFAULT_BANDS = new Set<Band>(["forecast", "signal"]);

export default function PipelinePage() {
  const [search, setSearch] = useState("");
  const [activeBands, setActiveBands] = useState<Set<Band>>(
    () => new Set(DEFAULT_BANDS),
  );
  const { data, isLoading, error, refetch } = useOpportunities({ limit: 200 });

  const items = useMemo(() => {
    let filtered = (data?.items ?? []).filter((o) => {
      const band = o.pwin?.band;
      if (activeBands.size > 0 && (!band || !activeBands.has(band))) return false;
      return true;
    });

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.agency?.toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => (b.pwin?.score ?? 0) - (a.pwin?.score ?? 0));
    return filtered;
  }, [data, search, activeBands]);

  function toggleBand(band: Band) {
    setActiveBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }

  const totalValue = items.reduce((sum, i) => sum + (i.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-foreground">Pipeline</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {items.length} items · {formatMoney(totalValue)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter pipeline..."
          className="w-full max-w-sm rounded border border-border bg-gda-bg-base px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
        />
        <div className="flex gap-1">
          {ALL_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              onClick={() => toggleBand(band)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-mono capitalize transition-colors border",
                activeBands.has(band)
                  ? "bg-gda-panel text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {band}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 bg-gda-panel" />
          ))}
        </div>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Agency</th>
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Score</th>
                <th className="px-3 py-2 text-left font-medium">Band</th>
                <th className="px-3 py-2 text-left font-medium">Drivers</th>
                <th className="px-3 py-2 text-left font-medium">Days to Due</th>
              </tr>
            </thead>
            <tbody>
              {items.map((opp) => (
                <PipelineRow key={opp.internal_id} opp={opp} />
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No opportunities match the selected bands.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineRow({ opp }: { opp: OpportunitySummary }) {
  const pwin = opp.pwin;

  return (
    <tr className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9">
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Link
            href={`/opportunities?id=${opp.internal_id}`}
            className="text-foreground hover:text-gda-green truncate block max-w-xs"
          >
            {opp.title}
          </Link>
          {pwin?.incumbent_competitor && (
            <Badge
              variant="outline"
              className="shrink-0 border-gda-amber/30 text-[11px] text-gda-amber"
              title="Named prime in title — not verified incumbency"
            >
              Named prime
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
        {opp.agency ?? "—"}
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-foreground tabular-nums">
        {formatMoney(opp.value)}
      </td>
      <td className="px-3 py-1.5 text-left">
        {pwin ? (
          <ScoreDisplay score={pwin.score} className="text-xs" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-left">
        {pwin?.band ? <BandBadge band={pwin.band} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {pwin?.top_drivers?.slice(0, 3).map((d, i) => (
            <Badge key={i} variant="outline" className="border-border text-[11px]">
              {d}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-muted-foreground tabular-nums">
        {pwin?.days_to_due != null ? `${pwin.days_to_due}d` : "—"}
      </td>
    </tr>
  );
}
