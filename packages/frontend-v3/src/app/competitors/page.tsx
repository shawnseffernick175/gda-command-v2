"use client";

import { useState, useRef, useEffect } from "react";
import { useCompetitors, useCompetitorsCount, useBlackHatAnalysis } from "@/hooks/use-competitors";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
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
        <BlackHatSection competitors={items} />
      </CollapseSection>
    </div>
  );
}

function BlackHatSection({ competitors }: { competitors: { name: string; win_count: number }[] }) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const blackHat = useBlackHatAnalysis(selectedCompetitor);

  const top20 = competitors
    .slice()
    .sort((a, b) => b.win_count - a.win_count)
    .slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Select competitor for analysis
        </label>
        <select
          value={selectedCompetitor ?? ""}
          onChange={(e) => setSelectedCompetitor(e.target.value || null)}
          className="rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          <option value="">-- Select --</option>
          {top20.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.win_count} wins)
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selectedCompetitor || blackHat.isPending}
          onClick={() => blackHat.mutate()}
          className="rounded bg-gda-green/20 px-3 py-1 text-xs font-medium text-gda-green hover:bg-gda-green/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {blackHat.isPending ? "Analyzing..." : "Run Black Hat Analysis"}
        </button>
      </div>

      {blackHat.isPending && (
        <div className="h-32 rounded bg-gda-panel animate-pulse" />
      )}

      {blackHat.isError && (
        <p className="text-xs text-red-400">
          {blackHat.error instanceof Error ? blackHat.error.message : "Analysis failed"}
        </p>
      )}

      {blackHat.data && (
        <div className="rounded border border-border bg-gda-bg-base p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-foreground">
              {blackHat.data.competitor}
            </span>
            <Badge variant="outline" className="text-[11px]">Black Hat Analysis</Badge>
            {blackHat.data.from_cache && (
              <span className="text-[11px] text-muted-foreground">Cached</span>
            )}
          </div>

          <div className="border-t border-border" />

          <div>
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Likely Approach
            </h4>
            <p className="text-xs text-foreground">{blackHat.data.likely_approach}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-[11px] text-gda-green mb-1">Strengths</h4>
              <ul className="space-y-0.5">
                {blackHat.data.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-gda-green shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] text-red-400 mb-1">Weaknesses</h4>
              <ul className="space-y-0.5">
                {blackHat.data.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-red-400 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Counter Strategy
            </h4>
            <div className="border-l-2 border-gda-cyan pl-3 bg-gda-panel/50 rounded-r p-2">
              <p className="text-xs text-foreground">{blackHat.data.counter_strategy}</p>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Intel Summary
            </h4>
            <p className="text-xs text-muted-foreground">{blackHat.data.intel_summary}</p>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Generated: {new Date(blackHat.data.generated_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
