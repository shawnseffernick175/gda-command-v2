"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAwardsPaged, useAwardsCount, useAwardAnalyze, useAwardPursue } from "@/hooks/use-awards";
import { Pagination } from "@/components/shared/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SourceChip } from "@/components/shared/source-chip";
import { PendingState } from "@/components/shared/pending-state";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { Award, AwardAnalysis, AwardsMeta } from "@/lib/types";

/* ── Tab definitions ──────────────────────────────────────────── */

type TabKey = "all" | "90d" | "1yr" | "incumbents" | "pursuing";

interface TabDef {
  key: TabKey;
  label: (meta: AwardsMeta | null) => string;
  colorClass: string;
}

const TAB_DEFS: TabDef[] = [
  { key: "all", label: (m) => `All${m ? ` (${m.total_count.toLocaleString()})` : ""}`, colorClass: "" },
  { key: "90d", label: (m) => `Expiring <90d${m ? ` (${m.expiring_90d})` : ""}`, colorClass: "text-gda-red" },
  { key: "1yr", label: (m) => `Expiring <1yr${m ? ` (${m.expiring_1yr})` : ""}`, colorClass: "text-gda-amber" },
  { key: "incumbents", label: (m) => `Incumbents${m ? ` (${m.incumbents_identified})` : ""}`, colorClass: "" },
  { key: "pursuing", label: (m) => `Already Pursuing${m ? ` (${m.pursuing_count})` : ""}`, colorClass: "text-gda-green" },
];

/* ── Value range options ──────────────────────────────────────── */

const VALUE_RANGES = [
  { label: "Any Value", min: undefined, max: undefined },
  { label: "<$1M", min: undefined, max: 1_000_000 },
  { label: "$1M–$10M", min: 1_000_000, max: 10_000_000 },
  { label: "$10M–$50M", min: 10_000_000, max: 50_000_000 },
  { label: ">$50M", min: 50_000_000, max: undefined },
] as const;

/* ── Heat bar helpers ─────────────────────────────────────────── */

function getAwardDaysLeft(award: Award): number | null {
  if (!award.period_of_performance_end) return null;
  const end = new Date(award.period_of_performance_end);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getHeatColor(award: Award): string | null {
  if (award.linked_opportunity_id) return "border-l-gda-green";
  const days = getAwardDaysLeft(award);
  if (days !== null && days <= 90) return "border-l-gda-red";
  if (days !== null && days <= 365) return "border-l-gda-amber";
  return null;
}

function formatExpiresColumn(award: Award): { text: string; className: string } {
  const days = getAwardDaysLeft(award);
  if (days === null) return { text: "—", className: "text-muted-foreground" };
  if (days < 0) return { text: "EXPIRED", className: "text-gda-red font-mono font-bold" };
  if (days <= 90) return { text: `${days}d`, className: "text-gda-red font-mono font-bold" };
  if (days <= 365) {
    const months = Math.round(days / 30);
    return { text: `${months}mo`, className: "text-gda-amber font-mono" };
  }
  const d = new Date(award.period_of_performance_end!);
  return {
    text: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    className: "text-muted-foreground",
  };
}

/* ── Main page ────────────────────────────────────────────────── */

export default function AwardsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get("page") ?? "1") || 1;

  // Filter state
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [incumbentInput, setIncumbentInput] = useState("");
  const [incumbentFilter, setIncumbentFilter] = useState("");
  const [naicsInput, setNaicsInput] = useState("");
  const [naicsFilter, setNaicsFilter] = useState("");
  const [valueRangeIdx, setValueRangeIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incumbentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const naicsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Map tab to query params
  const tabQueryParams = useMemo(() => {
    const base: Record<string, string | boolean | number | undefined> = {};
    if (activeTab === "90d") base.recompete = "90d";
    else if (activeTab === "1yr") base.recompete = "1yr";
    else if (activeTab === "incumbents") base.has_incumbent = true;
    else if (activeTab === "pursuing") base.pursuing = true;
    return base;
  }, [activeTab]);

  const vr = VALUE_RANGES[valueRangeIdx];

  const { data, isLoading, error, refetch } = useAwardsPaged({
    search: searchFilter || undefined,
    incumbent: incumbentFilter || undefined,
    naics: naicsFilter || undefined,
    value_min: vr?.min,
    value_max: vr?.max,
    recompete: tabQueryParams.recompete as string | undefined,
    has_incumbent: tabQueryParams.has_incumbent as boolean | undefined,
    pursuing: tabQueryParams.pursuing as boolean | undefined,
    limit: 50,
    page: currentPage,
  });
  const { data: countData } = useAwardsCount();

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const meta: AwardsMeta | null = data?.meta ?? null;

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

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchInput(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchFilter(val);
        setPage(1);
      }, 300);
    },
    [setPage],
  );

  const handleIncumbentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setIncumbentInput(val);
      if (incumbentDebounceRef.current) clearTimeout(incumbentDebounceRef.current);
      incumbentDebounceRef.current = setTimeout(() => {
        setIncumbentFilter(val);
        setPage(1);
      }, 300);
    },
    [setPage],
  );

  const handleNaicsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setNaicsInput(val);
      if (naicsDebounceRef.current) clearTimeout(naicsDebounceRef.current);
      naicsDebounceRef.current = setTimeout(() => {
        setNaicsFilter(val);
        setPage(1);
      }, 300);
    },
    [setPage],
  );

  const handleValueRangeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setValueRangeIdx(Number(e.target.value));
      setPage(1);
    },
    [setPage],
  );

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      setPage(1);
    },
    [setPage],
  );

  return (
    <div className="space-y-4" ref={listRef}>
      {/* Header */}
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

      {/* Intelligence Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <IntelChip
          label={meta ? `${meta.total_count.toLocaleString()} Total Awards` : "—"}
          onClick={() => handleTabChange("all")}
          active={activeTab === "all"}
        />
        <IntelChip
          label={meta ? `${meta.expiring_90d} Expiring <90 Days` : "—"}
          onClick={() => handleTabChange("90d")}
          active={activeTab === "90d"}
          colorClass="text-gda-red border-gda-red/30"
        />
        <IntelChip
          label={meta ? `${meta.expiring_1yr} Expiring <1yr` : "—"}
          onClick={() => handleTabChange("1yr")}
          active={activeTab === "1yr"}
          colorClass="text-gda-amber border-gda-amber/30"
        />
        <IntelChip
          label={meta ? `${formatMoney(meta.total_value)} Tracked Value` : "—"}
          onClick={() => handleTabChange("all")}
        />
        <IntelChip
          label={meta ? `${meta.incumbents_identified} Incumbents Identified` : "—"}
          onClick={() => handleTabChange("incumbents")}
          active={activeTab === "incumbents"}
        />
      </div>

      {/* Tab Filters */}
      <div className="flex items-center gap-1 border-b border-border">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-mono transition-colors border-b-2",
              activeTab === tab.key
                ? "border-gda-cyan text-gda-cyan"
                : "border-transparent text-muted-foreground hover:text-foreground",
              tab.colorClass && activeTab === tab.key ? tab.colorClass : "",
            )}
          >
            {tab.label(meta)}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search awards…"
          value={searchInput}
          onChange={handleSearchChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-56"
        />
        <input
          type="text"
          placeholder="Filter by incumbent…"
          value={incumbentInput}
          onChange={handleIncumbentChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-48"
        />
        <select
          value={String(valueRangeIdx)}
          onChange={handleValueRangeChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
        >
          {VALUE_RANGES.map((r, i) => (
            <option key={r.label} value={String(i)}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="NAICS code…"
          value={naicsInput}
          onChange={handleNaicsChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-32"
        />
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {/* Award Rows */}
      {isLoading && !items.length ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-gda-panel" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-1">
          {/* Column header */}
          <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            <span className="w-[3px]" />
            <span className="flex-1 min-w-0">Title + Incumbent</span>
            <span className="w-[130px] shrink-0">Agency</span>
            <span className="w-[100px] shrink-0 text-left">Value</span>
            <span className="w-[90px] shrink-0 text-left">Expires</span>
            <span className="w-[90px] shrink-0 text-left">Status</span>
            <span className="w-[80px] shrink-0 text-left">Actions</span>
          </div>
          {items.map((award) => (
            <AwardRow
              key={award.id}
              award={award}
              isExpanded={expandedId === award.id}
              onToggle={() => setExpandedId(expandedId === award.id ? null : award.id)}
            />
          ))}
        </div>
      ) : (
        !isLoading && (
          <PendingState
            surface="Awards"
            reason="No award data matches the current filters."
          />
        )
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

/* ── Intelligence chip ────────────────────────────────────────── */

function IntelChip({
  label,
  onClick,
  active,
  colorClass,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  colorClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded border px-3 py-1.5 text-[11px] font-mono transition-colors cursor-pointer",
        active
          ? "border-gda-cyan bg-gda-cyan/10 text-gda-cyan"
          : colorClass
            ? `${colorClass} bg-gda-panel hover:bg-gda-cyan/5`
            : "border-border bg-gda-panel text-muted-foreground hover:bg-gda-cyan/5 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* ── Award row ────────────────────────────────────────────────── */

function AwardRow({
  award,
  isExpanded,
  onToggle,
}: {
  award: Award;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const pursue = useAwardPursue();
  const heatColor = getHeatColor(award);
  const expires = formatExpiresColumn(award);

  const handlePursue = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      pursue.mutate(award.id, {
        onSuccess: (data) => {
          router.push(`/opportunities?id=${data.opportunity_id}`);
        },
      });
    },
    [award.id, pursue, router],
  );

  return (
    <div>
      <div
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded border border-border bg-gda-panel cursor-pointer hover:border-gda-cyan/40 transition-colors",
          heatColor ? `border-l-[3px] ${heatColor}` : "",
        )}
      >
        {/* Title + Incumbent */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">
            {award.recipient_name ?? award.incumbent_name ?? "Unknown Recipient"}
          </p>
          {(award.incumbent_name || award.contract_type || award.naics) && (
            <div className="flex items-center gap-2 mt-0.5">
              {award.incumbent_name && (
                <>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Incumbent: {award.incumbent_name}
                  </span>
                  {award.incumbent_name_sources?.[0]?.url && (
                    <SourceChip label="USAspending" url={award.incumbent_name_sources[0].url} kind="real" />
                  )}
                </>
              )}
              {award.contract_type && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {award.contract_type}
                </span>
              )}
              {award.naics && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  NAICS {award.naics}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Agency */}
        <span className="w-[130px] shrink-0 text-xs text-muted-foreground truncate text-left">
          {award.agency ?? "—"}
        </span>

        {/* Value */}
        <span className="w-[100px] shrink-0 font-mono text-sm text-foreground tabular-nums text-left">
          {formatMoney(award.awarded_amount)}
        </span>

        {/* Expires */}
        <span className={cn("w-[90px] shrink-0 text-xs text-left", expires.className)}>
          {expires.text}
        </span>

        {/* Status */}
        <span className="w-[90px] shrink-0 text-left">
          {award.linked_opportunity_id ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/opportunities?id=${award.linked_opportunity_id}`);
              }}
              className="text-[11px] font-mono text-gda-green hover:underline"
            >
              Pursuing ↗
            </button>
          ) : (
            <button
              onClick={handlePursue}
              disabled={pursue.isPending}
              className="rounded border border-gda-cyan/40 bg-gda-cyan/10 px-2 py-0.5 text-[11px] font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
            >
              {pursue.isPending ? "…" : "+ Pursue"}
            </button>
          )}
        </span>

        {/* Actions */}
        <span className="w-[80px] shrink-0 flex items-center gap-1 text-left">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="text-[11px] font-mono text-gda-cyan hover:underline"
          >
            {isExpanded ? "▾ Close" : "→ Detail"}
          </button>
        </span>
      </div>

      {/* Expanded inline detail panel */}
      {isExpanded && <AwardInlineDetail award={award} />}
    </div>
  );
}

/* ── Award inline detail (AI So-What + incumbent intel) ───────── */

function AwardInlineDetail({ award }: { award: Award }) {
  const router = useRouter();
  const analyze = useAwardAnalyze();
  const pursue = useAwardPursue();
  const analysis: AwardAnalysis | null =
    award.award_analysis ?? (analyze.data as AwardAnalysis | undefined) ?? null;
  const isAnalyzing = analyze.isPending;

  useEffect(() => {
    if (!award.award_analysis && !analyze.isPending && !analyze.data && !analyze.isError) {
      analyze.mutate(award.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [award.id, award.award_analysis]);

  const handlePursue = useCallback(
    () => {
      pursue.mutate(award.id, {
        onSuccess: (data) => {
          router.push(`/opportunities?id=${data.opportunity_id}`);
        },
      });
    },
    [award.id, pursue, router],
  );

  const usaspendingUrl = award.fpds_url
    ? award.fpds_url.includes("usaspending.gov/award/")
      ? award.fpds_url
      : `https://www.usaspending.gov/award/${award.id}/`
    : `https://www.usaspending.gov/award/${award.id}/`;

  return (
    <div className="ml-[3px] border border-t-0 border-border bg-gda-bg-base rounded-b px-4 py-4 space-y-4">
      {/* AI So-What */}
      <div className="space-y-2">
        <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          AI So-What
        </h3>
        {isAnalyzing && !analysis ? (
          <div className="space-y-2">
            <Skeleton className="h-16 bg-gda-panel" />
            <Skeleton className="h-4 w-2/3 bg-gda-panel" />
          </div>
        ) : analysis ? (
          <p className="text-xs text-foreground leading-relaxed">
            {analysis.so_what}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Analysis unavailable
          </p>
        )}
      </div>

      {/* Incumbent Intel */}
      <div className="space-y-2">
        <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Incumbent Intel
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Awardee:</span>{" "}
            <span className="text-foreground">{award.incumbent_name ?? award.recipient_name ?? "—"}</span>
            {award.incumbent_name_sources?.[0]?.url && (
              <SourceChip label="USAspending" url={award.incumbent_name_sources[0].url} kind="real" />
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Award Date:</span>{" "}
            <span className="text-foreground">
              {award.awarded_at ? new Date(award.awarded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            </span>
            <span className="text-muted-foreground ml-3">Expires:</span>{" "}
            <span className="text-foreground">
              {award.period_of_performance_end ? new Date(award.period_of_performance_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Contract #:</span>{" "}
            <span className="text-foreground font-mono">{award.id}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Value:</span>{" "}
            <span className="text-foreground font-mono">{formatMoney(award.awarded_amount)}</span>
          </div>
          {award.naics && (
            <div>
              <span className="text-muted-foreground">NAICS:</span>{" "}
              <span className="text-foreground font-mono">{award.naics}</span>
            </div>
          )}
          {award.set_aside && (
            <div>
              <span className="text-muted-foreground">Set-Aside:</span>{" "}
              <span className="text-foreground">{award.set_aside}</span>
            </div>
          )}
        </div>
      </div>

      {/* Analysis details */}
      {analysis && (
        <div className="space-y-2">
          {analysis.recommended_action && (
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-mono",
                analysis.recommended_action === "Pursue Re-Compete"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : analysis.recommended_action === "Monitor"
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                    : analysis.recommended_action === "Pass"
                      ? "bg-zinc-500/20 text-zinc-400 border-zinc-500/40"
                      : "bg-blue-500/20 text-blue-400 border-blue-500/40",
              )}
            >
              {analysis.recommended_action}
            </Badge>
          )}
          {analysis.win_rationale && (
            <div>
              <span className="text-[11px] text-muted-foreground font-mono uppercase">Win Rationale</span>
              <p className="text-xs text-foreground mt-0.5">{analysis.win_rationale}</p>
            </div>
          )}
          {analysis.recompete_assessment && (
            <div>
              <span className="text-[11px] text-muted-foreground font-mono uppercase">Re-Compete Assessment</span>
              <p className="text-xs text-foreground mt-0.5">{analysis.recompete_assessment}</p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-1">
        <a
          href={usaspendingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-mono text-gda-cyan hover:underline"
        >
          → View on USAspending ↗
        </a>
        <SourceChip label="USAspending" url={award.fpds_url} kind="real" />
        {!award.linked_opportunity_id && (
          <button
            onClick={handlePursue}
            disabled={pursue.isPending}
            className="rounded border border-gda-cyan/40 bg-gda-cyan/10 px-3 py-1 text-[11px] font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
          >
            {pursue.isPending ? "Creating…" : "+ Start Pursuit"}
          </button>
        )}
        {award.linked_opportunity_id && (
          <button
            onClick={() => router.push(`/opportunities?id=${award.linked_opportunity_id}`)}
            className="text-[11px] font-mono text-gda-green hover:underline"
          >
            Pursuing ↗
          </button>
        )}
      </div>
    </div>
  );
}
