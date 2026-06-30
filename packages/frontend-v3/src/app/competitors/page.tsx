"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCompetitorsPaged, useCompetitorsCount } from "@/hooks/use-competitors";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format-money";
import CompetitorDetailPanel, { SizeBadge } from "@/components/CompetitorDetailPanel";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import type { Competitor } from "@/lib/types";

export default function CompetitorsPage() {
  return (
    <Suspense fallback={<div />}>
      <CompetitorsContent />
    </Suspense>
  );
}

function CompetitorsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get("page") ?? "1") || 1;

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [naics, setNaics] = useState("");
  const [appliedNaics, setAppliedNaics] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(page));
      }
      router.push(`${pathname}?${params.toString()}`);
      listRef.current?.scrollIntoView({ behavior: "smooth" });
    },
    [searchParams, router, pathname],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, setPage]);

  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);

  const { sortBy, sortDir, handleSort, sortParams } = useTableSort();

  const { data, isLoading } = useCompetitorsPaged({ q: debouncedQ || undefined, naics: appliedNaics || undefined, limit: 50, page: currentPage, ...sortParams });
  const { data: countData } = useCompetitorsCount();

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6" ref={listRef}>
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-6 sticky-page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
                Competitor Intelligence
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Profiles of the companies you compete against, built from federal
                award history. Size up incumbents and rivals with automatic black-hat analysis
                and understand who you are up against on a given pursuit.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
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
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded border px-3 py-1.5 text-xs transition-colors ${
              showFilters || appliedNaics
                ? "border-gda-green/50 bg-gda-green/15 text-gda-green"
                : "border-border bg-gda-panel text-muted-foreground hover:text-foreground"
            }`}
          >
            Filter{appliedNaics ? " (1)" : ""}
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {debouncedQ || appliedNaics
              ? `${items.length} on this page`
              : countData
                ? `${countData.count.toLocaleString()} total`
                : `${items.length} on this page`}
          </span>
        </div>

        {showFilters && (
          <div className="flex items-end gap-3 rounded border border-border bg-gda-panel px-3 py-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                NAICS code
              </label>
              <input
                type="text"
                placeholder="e.g. 5415"
                value={naics}
                onChange={(e) => setNaics(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setAppliedNaics(naics.trim());
                    setPage(1);
                  }
                }}
                className="rounded border border-border bg-gda-bg-base px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 w-40"
              />
            </div>
            <button
              type="button"
              onClick={() => { setAppliedNaics(naics.trim()); setPage(1); }}
              className="rounded bg-gda-green/20 px-3 py-1 text-xs font-medium text-gda-green hover:bg-gda-green/30"
            >
              Apply
            </button>
            {appliedNaics && (
              <button
                type="button"
                onClick={() => { setNaics(""); setAppliedNaics(""); setPage(1); }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
              <SortableHeader label="Company" field="name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Wins" field="win_count" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Total Obligated" field="total_obligated" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Largest Award" field="largest_award" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Last Win" field="last_win" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Agencies" field="agency_count" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  <td colSpan={6} className="px-3 py-2">
                    <div className="h-3 bg-gda-panel rounded w-3/4" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No competitors match this search
                </td>
              </tr>
            ) : (
              items.map((c) => {
                const agencyDisplay = c.agencies?.[0] ?? "—";
                const agencyMore = (c.agencies?.length ?? 0) - 1;

                return (
                  <tr
                    key={c.name}
                    className="border-b border-border hover:bg-gda-panel/50 cursor-pointer"
                    onClick={() => setSelectedCompetitor(c)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground text-xs max-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate" title={c.name}>{c.name}</span>
                        <SizeBadge analysis={c.competitor_analysis ?? null} />
                      </div>
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {selectedCompetitor && (
        <CompetitorDetailPanel
          key={selectedCompetitor.name}
          competitor={selectedCompetitor}
          onClose={() => setSelectedCompetitor(null)}
        />
      )}
    </div>
  );
}


