"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useAwards, useAwardsCount } from "@/hooks/use-awards";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
import { SourceChip } from "@/components/shared/source-chip";
import { PendingState } from "@/components/shared/pending-state";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";
import type { Award } from "@/lib/types";

const CONTRACT_TYPES = [
  "All Types",
  "DELIVERY ORDER",
  "DEFINITIVE CONTRACT",
  "PURCHASE ORDER",
  "BPA CALL",
] as const;

const DATE_RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
  { label: "All time", days: null },
] as const;

function getAwardedAfter(days: number | null): string | undefined {
  if (days === null) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function AwardsPage() {
  const [agencyInput, setAgencyInput] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [contractType, setContractType] = useState<string>("All Types");
  const [dateRange, setDateRange] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [previousItems, setPreviousItems] = useState<Award[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const awardedAfter = useMemo(() => getAwardedAfter(dateRange), [dateRange]);

  const params = useMemo(
    () => ({
      agency: agencyFilter || undefined,
      contract_type: contractType === "All Types" ? undefined : contractType,
      awarded_after: awardedAfter,
      cursor,
    }),
    [agencyFilter, contractType, awardedAfter, cursor],
  );

  const { data, isLoading, error, refetch } = useAwards(params);
  const { data: countData } = useAwardsCount();

  const allItems = useMemo(() => {
    const combined = [...previousItems, ...(data?.items ?? [])];
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [previousItems, data?.items]);

  const resetFilters = useCallback(() => {
    setCursor(undefined);
    setPreviousItems([]);
  }, []);

  // Debounced agency filter
  const handleAgencyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setAgencyInput(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCursor(undefined);
        setPreviousItems([]);
        setAgencyFilter(val);
      }, 300);
    },
    [],
  );

  const handleContractTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      resetFilters();
      setContractType(e.target.value);
    },
    [resetFilters],
  );

  const handleDateRangeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      resetFilters();
      setDateRange(e.target.value === "all" ? null : Number(e.target.value));
    },
    [resetFilters],
  );

  const handleLoadMore = useCallback(() => {
    if (data?.pagination?.cursor) {
      setPreviousItems((prev) => [...prev, ...(data?.items ?? [])]);
      setCursor(data.pagination.cursor);
    }
  }, [data]);

  const hasMore = data?.pagination?.hasMore ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Competitive Intel — Awards
        </h1>
        {countData && (
          <Badge variant="outline" className="border-gda-cyan/30 text-gda-cyan font-mono text-[11px]">
            {countData.count.toLocaleString()} USAspending awards
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by agency…"
          value={agencyInput}
          onChange={handleAgencyChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-56"
        />
        <select
          value={contractType}
          onChange={handleContractTypeChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
        >
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={dateRange === null ? "all" : String(dateRange)}
          onChange={handleDateRangeChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
        >
          {DATE_RANGES.map((r) => (
            <option key={r.label} value={r.days === null ? "all" : String(r.days)}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && !allItems.length ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-gda-panel" />
          ))}
        </div>
      ) : allItems.length > 0 ? (
        <div className="space-y-2">
          {allItems.map((award) => (
            <AwardCard key={award.id} award={award} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoading}
              className="w-full rounded border border-border bg-gda-panel py-2 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-gda-cyan/30 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      ) : (
        !isLoading && (
          <PendingState
            surface="Awards"
            reason="No award data matches the current filters."
          />
        )
      )}

      {/* News Digest — pending F-217 */}
      <CollapseSection
        id="awards-news"
        title="News Digest"
        defaultOpen={false}
      >
        <PendingState
          surface="News Digest"
          reason="Activates with the intelligence layer (F-217). Will auto-summarize industry news, competitor moves, and policy changes."
        />
      </CollapseSection>
    </div>
  );
}

function AwardCard({ award }: { award: Award }) {
  const formattedDate = award.awarded_at
    ? new Date(award.awarded_at).toLocaleDateString()
    : "—";

  return (
    <Card className="border-border bg-gda-panel">
      <CardContent className="space-y-1.5 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {award.contract_type && (
            <Badge
              variant="outline"
              className="border-gda-amber/30 text-gda-amber text-[11px] font-mono"
            >
              {award.contract_type}
            </Badge>
          )}
          <SourceChip
            label="USAspending"
            url={award.fpds_url}
            kind="real"
          />
          <span className="ml-auto text-[11px] text-muted-foreground font-mono">
            {formattedDate}
          </span>
          {award.awarded_at_sources?.map((s, i) => (
            <SourceChip key={`date-${i}`} label={s.title} url={s.url} kind="real" />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground text-[11px]">Recipient:</span>{" "}
            {award.recipient_name ?? "—"}
          </p>
          {award.recipient_name_sources?.map((s, i) => (
            <SourceChip key={`rcpt-${i}`} label={s.title} url={s.url} kind="real" />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-muted-foreground">
            <span className="text-muted-foreground">Agency:</span>{" "}
            {award.agency ?? "—"}
          </p>
          {award.agency_sources?.map((s, i) => (
            <SourceChip key={`agcy-${i}`} label={s.title} url={s.url} kind="real" />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-foreground tabular-nums">
            {formatMoney(award.awarded_amount)}
          </span>
          {award.awarded_amount_sources?.map((s, i) => (
            <SourceChip key={`amt-${i}`} label={s.title} url={s.url} kind="real" />
          ))}
          {award.fpds_url && (
            <a
              href={award.fpds_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-gda-cyan hover:underline font-mono"
            >
              FPDS ↗
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
