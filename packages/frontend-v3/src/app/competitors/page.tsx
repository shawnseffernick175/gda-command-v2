"use client";

import { useState, useRef, useEffect } from "react";
import { useCompetitors, useCompetitorsCount } from "@/hooks/use-competitors";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
import { PendingState } from "@/components/shared/pending-state";
import { formatMoney } from "@/lib/format-money";

export default function CompetitorsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(q), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const { data, isLoading } = useCompetitors({ q: debouncedQ || undefined, limit: 100 });
  const { data: countData } = useCompetitorsCount();

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-foreground">
            Competitor Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregated from USAspending.gov federal contract awards
          </p>
        </div>
        {countData && (
          <Badge variant="outline" className="font-mono text-xs">
            {countData.count.toLocaleString()} companies
          </Badge>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search company name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 w-64"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(""); setDebouncedQ(""); }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {items.length} results
        </span>
      </div>

      {/* Table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 text-left font-medium">Wins</th>
              <th className="px-3 py-2 text-left font-medium">Total Obligated</th>
              <th className="px-3 py-2 text-left font-medium">Largest Award</th>
              <th className="px-3 py-2 text-left font-medium">Last Win</th>
              <th className="px-3 py-2 text-left font-medium">Agencies</th>
              <th className="px-3 py-2 text-left font-medium">NAICS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  <td colSpan={7} className="px-3 py-2">
                    <div className="h-3 bg-gda-panel rounded w-3/4" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No competitors match this search
                </td>
              </tr>
            ) : (
              items.map((c) => {
                const agencyDisplay = c.agencies?.[0] ?? "—";
                const agencyMore = (c.agencies?.length ?? 0) - 1;
                const naicsDisplay = c.naics_codes?.[0] ?? "—";
                const naicsMore = (c.naics_codes?.length ?? 0) - 1;

                return (
                  <tr key={c.name} className="border-b border-border hover:bg-gda-panel/50">
                    <td className="px-3 py-2 font-medium text-foreground text-xs max-w-[220px]">
                      <span className="truncate block" title={c.name}>{c.name}</span>
                      {c.awardee_uei && (
                        <span className="text-[11px] text-muted-foreground font-mono">{c.awardee_uei}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-left">
                      <Badge variant="outline" className="text-[11px] font-mono">
                        {c.win_count}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-foreground tabular-nums">
                      {c.total_obligated != null ? formatMoney(c.total_obligated) : "—"}
                    </td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-foreground tabular-nums">
                      {c.largest_award != null ? formatMoney(c.largest_award) : "—"}
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground">
                      {c.last_win_date ? new Date(c.last_win_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground max-w-[150px]">
                      <span
                        title={c.agencies?.join(", ")}
                        className="truncate block"
                      >
                        {agencyDisplay}
                        {agencyMore > 0 && (
                          <span className="text-[11px] text-muted-foreground ml-1">+{agencyMore}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground">
                      <span title={c.naics_codes?.join(", ")}>
                        {naicsDisplay}
                        {naicsMore > 0 && (
                          <span className="text-[11px] ml-1">+{naicsMore}</span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CollapseSection
        id="comp-black-hat"
        title="Black Hat Analysis"
        defaultOpen={false}
      >
        <PendingState
          surface="Black Hat Analysis"
          reason="Will auto-generate competitor perspective analysis using the LLM router. Activates with the intelligence layer."
        />
      </CollapseSection>
    </div>
  );
}
