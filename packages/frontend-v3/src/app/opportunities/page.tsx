"use client";

import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useOpportunitiesPaged,
  useOpportunity,
  useAnalyzeOpportunity,
  useUpdateStage,
  type OpportunityMeta,
} from "@/hooks/use-opportunities";
import { Pagination } from "@/components/shared/Pagination";
import { useVehicles, useVehicleOpportunities, type VehicleSummary, type VehicleOpportunity } from "@/hooks/use-vehicles";
import { useAskAi } from "@/hooks/use-llm";
import { SourceChip } from "@/components/shared/source-chip";
import { ScoreTooltip } from "@/components/shared/score-tooltip";
import { FieldStatusBadge } from "@/components/field-status-badge";
import { ErrorState } from "@/components/shared/error-state";
import { useVaultDocuments } from "@/hooks/use-vault";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import {
  STAGE_TABS as CANONICAL_STAGE_TABS,
  STAGE_ACTIONS as CANONICAL_STAGE_ACTIONS,
  STAGE_BADGE_STYLES as CANONICAL_BADGE_STYLES,
  ACTIVE_STAGES as CANONICAL_ACTIVE_STAGES,
  stageKeyToLabel,
  CANONICAL_STAGE_KEYS,
  DB_KEY_TO_LABEL,
  type ActiveStage,
} from "@/lib/stages";
import type {
  DoctrineFitLabel,
  LlmAnalysis,
  ShipleyDimension,
  OpportunitySummary,
} from "@/lib/types";

const IDIQ_BADGE_CLS = "rounded border border-gda-green/40 bg-gda-green/10 px-1.5 py-0.5 text-[11px] font-mono text-gda-green";

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64 bg-gda-panel" />}>
      <OpportunitiesContent />
    </Suspense>
  );
}

function OpportunitiesContent() {
  const searchParams = useSearchParams();
  const detailId = searchParams.get("id");

  if (detailId) return <OpportunityDetail key={detailId} id={detailId} />;
  return <OpportunityList />;
}

/* ── Stage tabs config (from shared canonical model) ────────────── */

const STAGE_TABS = CANONICAL_STAGE_TABS;

/* ── Urgency heat helpers ───────────────────────────────────────── */

function getHeatColor(opp: OpportunitySummary): string | null {
  const daysLeft = getDaysLeft(opp);
  if (daysLeft !== null && (daysLeft <= 7 || daysLeft < 0)) return "border-l-gda-red";
  if (daysLeft !== null && daysLeft <= 30) return "border-l-gda-amber";
  const isHot = opp.pwin && opp.pwin.score >= 70;
  const pipelineStage = opp.pipeline_stage;
  if (isHot && !pipelineStage) return "border-l-gda-cyan";
  if (isHot && pipelineStage) return "border-l-gda-green";
  return null;
}

function getEffectiveDueDate(opp: OpportunitySummary): string | null {
  return opp.response_due_at ?? opp.due_date ?? null;
}

function getEffectiveValue(opp: OpportunitySummary): number | null {
  return opp.value_max ?? opp.value_min ?? opp.value ?? null;
}

function getDaysLeft(opp: OpportunitySummary): number | null {
  const dd = getEffectiveDueDate(opp);
  if (!dd) return null;
  const due = new Date(dd);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaysLeft(opp: OpportunitySummary): { text: string; className: string } {
  const days = getDaysLeft(opp);
  if (days === null) return { text: "—", className: "text-muted-foreground" };
  if (days < 0) return { text: "PAST DUE", className: "text-gda-red font-mono font-bold italic" };
  if (days <= 7) return { text: `${days}d`, className: "text-gda-red font-mono font-bold" };
  if (days <= 30) return { text: `${days}d`, className: "text-gda-amber font-mono" };
  const d = new Date(getEffectiveDueDate(opp)!);
  return {
    text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    className: "text-muted-foreground",
  };
}

/* ── Stage badge colors (from shared canonical model) ───────────── */

// Map a partner key to a short display name for the eligibility tag.
function partnerLabel(key: string): string {
  if (key === "pd_systems") return "PD Sys";
  if (key === "riverstone") return "Riverstone";
  return key;
}

// Map a verbose set-aside string (e.g. "Total Small Business Set-Aside (FAR 19.5)")
// to a compact tag. Returns null when there is no set-aside (unrestricted).
// Used as a fallback when backend eligibility is not present on a row.
function shortSetAside(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("service-disabled") || s.includes("sdvosb")) return "SDVOSB";
  if (s.includes("8(a)") || s.includes("8a")) return "8(a)";
  if (s.includes("hubzone")) return "HUBZone";
  if (s.includes("women") || s.includes("wosb") || s.includes("edwosb")) return "WOSB";
  if (s.includes("veteran") || s.includes("vosb")) return "VOSB";
  if (s.includes("small business") || s.includes("sba") || s.includes(" sb")) return "SB";
  // Unknown but present: trim to a short token so the column stays tidy.
  return raw.length > 14 ? `${raw.slice(0, 13)}.` : raw;
}

const STAGE_BADGE_STYLES = CANONICAL_BADGE_STYLES;

/* ── Value range options ────────────────────────────────────────── */

const VALUE_RANGES = [
  { label: "Any Value", min: undefined, max: undefined },
  { label: "<$1M", min: undefined, max: 1_000_000 },
  { label: "$1M–$10M", min: 1_000_000, max: 10_000_000 },
  { label: "$10M–$50M", min: 10_000_000, max: 50_000_000 },
  { label: "$50M–$100M", min: 50_000_000, max: 100_000_000 },
  { label: ">$100M", min: 100_000_000, max: undefined },
] as const;

/* ── Set-aside filter options (header dropdown) ─────────────────── */

const SET_ASIDE_OPTIONS = [
  "SDVOSB", "8(a)", "HUBZone", "WOSB", "VOSB", "SB",
] as const;

/* ══════════════════════════════════════════════════════════════════ */

function OpportunityList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter state
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [agencyFilter, setAgencyFilter] = useState(searchParams.get("agency") ?? "");
  const [hotFilter, setHotFilter] = useState(false);
  const [setAsideFilter, setSetAsideFilter] = useState<string[]>([]);
  const [valueRange, setValueRange] = useState(0);
  const [dueFilter, setDueFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [idiqFilter, setIdiqFilter] = useState<'only' | 'exclude' | undefined>(undefined);
  const [stageTab, setStageTab] = useState("all");
  const [groupBy, setGroupBy] = useState<"none" | "vehicle">("none");
  const [page, setPage] = useState(1);
  // Column sort state. null sortBy = default recency order.
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click a column to sort. Same column toggles direction; new column starts desc.
  const handleSort = useCallback((field: string) => {
    setSortBy((prevField) => {
      if (prevField === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return field;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  const filterParams = useMemo(() => {
    const range = VALUE_RANGES[valueRange];
    return {
      q: debouncedQ || undefined,
      agency: agencyFilter || undefined,
      hot: hotFilter ? "1" : undefined,
      set_asides: setAsideFilter.length > 0 ? setAsideFilter : undefined,
      value_min: range?.min,
      value_max: range?.max,
      due: dueFilter || undefined,
      sources: sourceFilter.length > 0 ? sourceFilter : undefined,
      stage: stageTab !== "all" ? stageTab : undefined,
      relevant_only: relevantOnly,
      idiq: idiqFilter,
      sort_by: sortBy ?? undefined,
      sort_dir: sortBy ? sortDir : undefined,
      limit: 50,
    };
  }, [debouncedQ, agencyFilter, hotFilter, setAsideFilter, valueRange, dueFilter, sourceFilter, stageTab, relevantOnly, idiqFilter, sortBy, sortDir]);

  // Any change to the active filter set returns the user to page 1.
  // Adjust state during render (React's supported pattern) rather than in an
  // effect, which avoids a cascading re-render.
  const filterKey = JSON.stringify(filterParams);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useOpportunitiesPaged({ ...filterParams, page });

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const meta: OpportunityMeta | undefined = data?.meta;
  const totalPages = data?.totalPages ?? 1;

  // Vehicle grouping
  const { data: vehiclesData, isLoading: vehiclesLoading } = useVehicles();

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQ(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setDebouncedQ(val), 300);
    },
    [],
  );

  const hasActiveFilters =
    debouncedQ || agencyFilter || hotFilter || setAsideFilter.length > 0 ||
    valueRange !== 0 || dueFilter || sourceFilter.length > 0 || idiqFilter !== undefined;

  const handleClearFilters = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ("");
    setDebouncedQ("");
    setAgencyFilter("");
    setHotFilter(false);
    setSetAsideFilter([]);
    setValueRange(0);
    setDueFilter("");
    setSourceFilter([]);
    setIdiqFilter(undefined);
    // Strip ?agency from the URL so a remount does not re-apply a stale filter
    if (searchParams.get("agency")) {
      router.replace("/opportunities");
    }
  }, [router, searchParams]);

  const toggleArrayFilter = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
      setter((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
      );
    },
    [],
  );

  // Intelligence bar chip click handlers
  const handleDueThisWeekClick = useCallback(() => {
    setDueFilter((prev) => (prev === "this_week" ? "" : "this_week"));
  }, []);

  const handleHotClick = useCallback(() => {
    setHotFilter((prev) => !prev);
  }, []);

  const applyAgencyFilter = useCallback((value: string) => {
    setAgencyFilter(value);
    setPage(1);
  }, []);

  // Compute stage tab counts from meta
  const getStageCount = useCallback(
    (key: string): number => {
      if (!meta) return 0;
      if (key === "all") return meta.total_count;
      if (key === "active") {
        const sc = meta.stage_counts;
        return Object.entries(sc)
          .filter(([k]) => !["won", "lost", "no_bid", "gov_cancelled", "passed"].includes(k))
          .reduce((sum, [, v]) => sum + v, 0);
      }
      return meta.stage_counts[key] ?? 0;
    },
    [meta],
  );

  return (
    <div className="space-y-4">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        {/* Page header */}
        <h1 className="font-mono text-lg font-bold text-foreground">
          Opportunities
        </h1>

        {/* Intelligence bar */}
        {meta && (
          <div className="flex flex-wrap gap-2">
            <IntelChip
              icon="#"
              label={`${meta.total_count} Active`}
              active={false}
            />
            <IntelChip
              icon="!"
              label={`${meta.due_this_week} Due This Week`}
              active={dueFilter === "this_week"}
              onClick={handleDueThisWeekClick}
            />
            <IntelChip
              icon="?"
              label={`${meta.unscored_count} Unscored`}
              active={false}
            />
            <IntelChip
              icon="$"
              label={`${formatMoney(meta.total_value)} Total Value`}
              active={false}
            />
            <HotChip
              count={meta.hot_count}
              active={hotFilter}
              onClick={handleHotClick}
            />
            {meta.idiq_count > 0 && (
              <IntelChip
                icon="I"
                label={`${meta.idiq_count} IDIQ`}
                active={idiqFilter === 'only'}
                onClick={() => setIdiqFilter((prev) => prev === 'only' ? undefined : 'only')}
              />
            )}
          </div>
        )}

        {/* Filter bar (column-level filters live in the table headers now) */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Search title, agency, solicitation #…"
            value={q}
            onChange={handleSearchChange}
            className="flex-grow min-w-[200px] rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
          />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={relevantOnly}
              onChange={(e) => setRelevantOnly(e.target.checked)}
              className="accent-gda-green h-3.5 w-3.5"
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Relevant Only (IT/Consulting)</span>
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Stage tabs + group toggle */}
        <div className="border-b border-border flex gap-0 overflow-x-auto items-center">
          {STAGE_TABS.map((tab) => {
            const count = getStageCount(tab.key);
            const active = stageTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStageTab(tab.key)}
                className={cn(
                  "pb-2 px-3 text-xs font-mono whitespace-nowrap transition-colors",
                  active
                    ? "border-b-2 border-gda-green text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label} ({count})
              </button>
            );
          })}
          <div className="ml-auto pl-3">
            <button
              type="button"
              onClick={() => setGroupBy(g => g === "none" ? "vehicle" : "none")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded border transition-colors",
                groupBy === "vehicle"
                  ? "border-gda-green text-gda-green bg-gda-green/10"
                  : "border-border text-muted-foreground hover:border-gda-green/50",
              )}
            >
              <span>{groupBy === "vehicle" ? "\u229F" : "\u229E"}</span>
              Group by Vehicle
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {/* Vehicle-grouped view */}
      {groupBy === "vehicle" ? (
        vehiclesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 bg-gda-panel" />
            ))}
          </div>
        ) : (
          <VehicleGroupedView
            vehicles={vehiclesData ?? []}
            onNavigate={(id) => router.push(`/opportunities?id=${id}`)}
            onAgencyFilter={applyAgencyFilter}
          />
        )
      ) : (
        <>
          {/* Loading skeleton */}
          {isLoading && allItems.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 bg-gda-panel" />
              ))}
            </div>
          ) : (
            <>
              {/* Table — no inner scroll; the outer page scrolls */}
              <div className="rounded border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                      <th className="w-[3px] p-0 bg-gda-bg-base" />
                      <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Agency" field="agency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="140px" />
                      <SortableHeader label="Value" field="value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                      <SortableHeader label="Pwin" field="pwin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                      <SortableHeader label="Stage" field="stage" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="150px" />
                      <SortableHeader
                        label="Set-Aside"
                        field="set_aside"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={handleSort}
                        width="120px"
                        filter={{
                          options: SET_ASIDE_OPTIONS,
                          selected: setAsideFilter,
                          onToggle: (v) => toggleArrayFilter(setSetAsideFilter, v),
                        }}
                      />
                      <SortableHeader label="Due" field="due" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                      <th className="px-3 py-2 text-left font-medium w-[60px] bg-gda-bg-base">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((opp) => (
                      <OpportunityRow
                        key={String(opp.internal_id ?? opp.id)}
                        opp={opp}
                        onNavigate={(id) => router.push(`/opportunities?id=${id}`)}
                        onAgencyFilter={applyAgencyFilter}
                      />
                    ))}
                  </tbody>
                </table>
                {allItems.length === 0 && !isLoading && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No opportunities match your filter.
                  </div>
                )}
              </div>

              {/* Page selector */}
              {allItems.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground font-mono">
                    Page {page} of {totalPages}
                  </span>
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Hot (Pwin ≥ 70%) chip with tooltip ─────────────────────────── */

function HotChip({
  count,
  active,
  onClick,
}: {
  count: number;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <ScoreTooltip
      label="Hot"
      explanation="Hot = opportunities with Pwin (probability of win) ≥ 70%. Count reflects the current filter / tab."
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "bg-gda-panel border rounded px-3 py-1.5 text-xs font-mono transition-colors",
          active
            ? "border-gda-green text-gda-green bg-gda-green/10"
            : "border-border text-foreground",
          onClick
            ? "cursor-pointer hover:border-gda-green/40"
            : "cursor-default",
        )}
      >
        <svg className="inline-block h-3.5 w-3.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg> {count} Hot
      </button>
    </ScoreTooltip>
  );
}

/* ── Intelligence chip ──────────────────────────────────────────── */

function IntelChip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "bg-gda-panel border rounded px-3 py-1.5 text-xs font-mono transition-colors",
        active
          ? "border-gda-green text-gda-green bg-gda-green/10"
          : "border-border text-foreground",
        onClick
          ? "cursor-pointer hover:border-gda-green/40"
          : "cursor-default",
      )}
    >
      {icon} {label}
    </button>
  );
}

/* ── Sortable / filterable table header ─────────────────────────── */

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  width,
  align = "left",
  filter,
}: {
  label: string;
  field?: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  width?: string;
  align?: "left" | "right";
  filter?: {
    options: readonly string[];
    selected: string[];
    onToggle: (value: string) => void;
  };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);
  const active = field != null && sortBy === field;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // ASCII carets only (no unicode glyphs, to satisfy the forbidden-token check).
  const caret = active ? (sortDir === "asc" ? "^" : "v") : "";
  const filterCount = filter?.selected.length ?? 0;

  return (
    <th
      ref={ref}
      className={cn(
        "relative px-3 py-2 font-medium",
        align === "right" ? "text-right" : "text-left",
      )}
      style={width ? { width } : undefined}
    >
      <div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
        {field ? (
          <button
            type="button"
            onClick={() => onSort(field)}
            className={cn(
              "flex items-center gap-1 transition-colors hover:text-foreground",
              active ? "text-gda-green" : "text-muted-foreground",
            )}
            title={`Sort by ${label}`}
          >
            <span>{label}</span>
            {caret && <span className="font-mono text-[11px]">{caret}</span>}
          </button>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        )}
        {filter && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              "flex items-center font-mono text-[10px] transition-colors hover:text-foreground",
              filterCount > 0 ? "text-gda-green" : "text-muted-foreground/60",
            )}
            title={`Filter ${label}`}
          >
            <span>{"\u25BE"}</span>
            {filterCount > 0 && (
              <span className="ml-0.5 rounded-full bg-gda-green/20 px-1 text-gda-green">
                {filterCount}
              </span>
            )}
          </button>
        )}
      </div>
      {filter && menuOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded border border-border bg-gda-panel shadow-lg py-1 min-w-[150px] font-normal normal-case">
          {filter.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => filter.onToggle(opt)}
              className={cn(
                "w-full text-left px-3 py-1 text-xs hover:bg-gda-green/10 transition-colors flex items-center gap-2",
                filter.selected.includes(opt) ? "text-gda-green" : "text-foreground",
              )}
            >
              <span className="w-3">{filter.selected.includes(opt) ? "x" : ""}</span>
              {opt}
            </button>
          ))}
        </div>
      )}
    </th>
  );
}

/* ── Vehicle grouped view ───────────────────────────────────────── */

function VehicleGroupedView({
  vehicles,
  onNavigate,
  onAgencyFilter,
}: {
  vehicles: VehicleSummary[];
  onNavigate: (id: number | string) => void;
  onAgencyFilter?: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {vehicles.map((vehicle) => (
        <VehicleGroup key={vehicle.id} vehicle={vehicle} onNavigate={onNavigate} onAgencyFilter={onAgencyFilter} />
      ))}
    </div>
  );
}

function VehicleGroup({
  vehicle,
  onNavigate,
  onAgencyFilter,
}: {
  vehicle: VehicleSummary;
  onNavigate: (id: number | string) => void;
  onAgencyFilter?: (value: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: opportunities, isLoading } = useVehicleOpportunities(vehicle.id);

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gda-panel border border-border rounded-t text-left hover:border-gda-green/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-gda-green font-bold">{collapsed ? "\u25B6" : "\u25BC"}</span>
          <div>
            <span className="font-mono text-sm font-semibold text-foreground">{vehicle.short_name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{vehicle.name}</span>
          </div>
          {vehicle.agency && (
            <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
              {vehicle.agency}
            </span>
          )}
          <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
            {vehicle.vehicle_type}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
          <span>{vehicle.opportunity_count} opportunities</span>
          {vehicle.pipeline_count > 0 && (
            <span className="text-gda-green">{vehicle.pipeline_count} in pipeline</span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="border border-t-0 border-border rounded-b divide-y divide-border">
          {isLoading ? (
            <div className="px-4 py-3">
              <Skeleton className="h-6 bg-gda-panel" />
            </div>
          ) : !opportunities || opportunities.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground font-mono">
              No open opportunities detected under this vehicle.
            </div>
          ) : (
            opportunities.map((opp) => (
              <VehicleOpportunityRow key={opp.id} opp={opp} onNavigate={onNavigate} onAgencyFilter={onAgencyFilter} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function VehicleOpportunityRow({
  opp,
  onNavigate,
  onAgencyFilter,
}: {
  opp: VehicleOpportunity;
  onNavigate: (id: number | string) => void;
  onAgencyFilter?: (value: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 hover:bg-gda-panel/50 transition-colors cursor-pointer"
      onClick={() => onNavigate(opp.id)}
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground hover:text-gda-green truncate block">
          {opp.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          {opp.agency && (
            <button
              type="button"
              className="text-[11px] font-mono text-muted-foreground hover:text-gda-green cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onAgencyFilter?.(opp.agency!); }}
            >
              {opp.agency}
            </button>
          )}
          {opp.naics && (
            <span className="text-[11px] font-mono text-muted-foreground/60">NAICS {opp.naics}</span>
          )}
          {opp.set_aside && (
            <span className="text-[11px] font-mono text-muted-foreground/60">{opp.set_aside}</span>
          )}
          {opp.match_type && (
            <span className="text-[11px] font-mono text-gda-green/70">{opp.match_type}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground shrink-0">
        {opp.is_idiq ? (
          <span className={IDIQ_BADGE_CLS}>IDIQ</span>
        ) : (opp.value_max || opp.value_min) ? (
          <span>{formatMoney(opp.value_max ?? opp.value_min)}</span>
        ) : (
          <FieldStatusBadge reason="no_source_data" />
        )}
        {opp.pipeline_stage && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px]">
            {opp.pipeline_stage}
          </span>
        )}
        {opp.response_due_at ? (
          <span>
            {new Date(opp.response_due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        ) : (
          <FieldStatusBadge reason="no_source_data" />
        )}
      </div>
    </div>
  );
}

/* ── Table row with heat bar + hover actions ────────────────────── */

function OpportunityRow({
  opp,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onNavigate,
  onAgencyFilter,
}: {
  opp: OpportunitySummary;
  onNavigate: (id: number | string) => void;
  onAgencyFilter?: (value: string) => void;
}) {
  const updateStage = useUpdateStage();
  const heat = getHeatColor(opp);
  const daysLeft = formatDaysLeft(opp);
  const pipelineStage = opp.pipeline_stage;
  const score = opp.pwin?.score;
  // Pwin color band: green (strong), amber (moderate), red (weak).
  const pwinClass =
    score == null
      ? "text-muted-foreground"
      : score >= 65
        ? "text-gda-green"
        : score >= 45
          ? "text-gda-amber"
          : "text-red-400";
  // Eligibility lens: prefer backend-resolved eligibility; fall back to a plain
  // set-aside tag for any older cached rows that lack the field.
  const elig = opp.eligibility ?? null;
  const setAsideLabel = shortSetAside(opp.set_aside);

  const sources: string[] = [];
  if (opp.data_source) sources.push(opp.data_source);
  if (opp.source && opp.source !== opp.data_source) sources.push(opp.source);

  return (
    <tr
      className={cn(
        "border-b border-border hover:bg-gda-panel/50 transition-colors h-9",
        heat ? `border-l-[3px] ${heat}` : "border-l-[3px] border-l-transparent",
      )}
    >
      <td className="p-0 w-0" />
      <td className="px-3 py-1.5">
        <div>
          <Link
            href={`/opportunities?id=${opp.id}`}
            className="text-foreground hover:text-gda-green truncate block max-w-xs text-sm"
          >
            {opp.title}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {sources.length > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground/40">
                {sources.map((s, i) => (
                  <span key={s}>
                    {i > 0 && "  "}  {s}
                  </span>
                ))}
              </span>
            )}
            {opp.naics && (
              <span className="text-[11px] font-mono text-muted-foreground/60">
                NAICS {opp.naics}
              </span>
            )}
            {opp.set_aside && (
              <span className="text-[11px] font-mono text-muted-foreground/60">
                {opp.set_aside}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[140px]" title={[opp.department, opp.agency_name, opp.contracting_office].filter(Boolean).join(' > ') || opp.agency || undefined}>
        {(() => {
          const agencyText = opp.agency_name ?? opp.department ?? opp.agency;
          if (!agencyText) return "---";
          return (
            <button
              type="button"
              className="text-left text-xs text-muted-foreground hover:text-gda-green underline-offset-2 hover:underline cursor-pointer truncate block max-w-[140px]"
              onClick={() => onAgencyFilter?.(agencyText)}
            >
              {agencyText}
            </button>
          );
        })()}
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-foreground tabular-nums">
        {opp.is_idiq ? (
          <span className={IDIQ_BADGE_CLS}>IDIQ</span>
        ) : formatMoney(getEffectiveValue(opp))}
      </td>
      <td className="px-3 py-1.5 text-left">
        {score != null ? (
          <span className={cn("font-mono text-xs tabular-nums", pwinClass)}>{score}%</span>
        ) : (
          <FieldStatusBadge reason={opp.ai_analyzed_at == null ? "pending_analysis" : "no_source_data"} />
        )}
      </td>
      <td className="px-3 py-1.5">
        {/* Inline stage select: change stage without opening the opp. */}
        <select
          value={pipelineStage ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = e.target.value;
            if (next) updateStage.mutate({ id: String(opp.id), stage: next });
          }}
          disabled={updateStage.isPending}
          className={cn(
            "w-full rounded border bg-gda-panel px-1.5 py-0.5 text-[11px] font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-gda-green/50",
            pipelineStage
              ? (STAGE_BADGE_STYLES[pipelineStage] ?? "border-border text-foreground")
              : "border-border text-muted-foreground",
          )}
        >
          {!pipelineStage && <option value="">---</option>}
          {CANONICAL_STAGE_KEYS.map((key) => (
            <option key={key} value={key}>
              {DB_KEY_TO_LABEL[key]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        {elig ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-mono whitespace-nowrap",
              elig.status === "prime"
                ? "border-gda-green/40 bg-gda-green/10 text-gda-green"
                : elig.status === "team"
                  ? "border-gda-amber/40 bg-gda-amber/10 text-gda-amber"
                  : elig.status === "ineligible"
                    ? "border-border text-muted-foreground/60"
                    : "border-border text-muted-foreground",
            )}
            title={elig.rationale}
          >
            {elig.status === "prime" && <span>Prime</span>}
            {elig.status === "team" && (
              <span>
                Team{elig.partner ? ` (${partnerLabel(elig.partner)})` : ""}
              </span>
            )}
            {elig.status === "ineligible" && <span>No bid</span>}
            {elig.status === "unrestricted" ? (
              <span>Open</span>
            ) : (
              <span className="opacity-70">{elig.label}</span>
            )}
          </span>
        ) : setAsideLabel ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-mono text-foreground">
            {setAsideLabel}
          </span>
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground">Unrestricted</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <span className={cn("text-xs", daysLeft.className)}>{daysLeft.text}</span>
      </td>
      <td className="px-3 py-1.5">
        {/* Decluttered: two left-aligned actions, always visible. */}
        <div className="flex items-center justify-start gap-2">
          <Link
            href={`/opportunities?id=${opp.id}`}
            className="text-[11px] font-mono text-muted-foreground hover:text-gda-green transition-colors"
            title="View detail"
            onClick={(e) => e.stopPropagation()}
          >
            {"->"}
          </Link>
          {opp.source_uri && (
            <a
              href={opp.source_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-gda-cyan hover:underline transition-colors"
              title="View solicitation"
              onClick={(e) => e.stopPropagation()}
            >
              src
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Detail page (F-621b redesign) ──────────────────────────────── */
const FIT_COLORS: Record<DoctrineFitLabel, string> = {
  strong: "text-gda-green",
  moderate: "text-gda-cyan",
  weak: "text-gda-amber",
  none: "text-muted-foreground",
};

// Stage constants from shared canonical model
const STAGES = CANONICAL_ACTIVE_STAGES;
const STAGE_ACTIONS = CANONICAL_STAGE_ACTIONS;

const SUGGESTION_CHIPS = [
  "What's Envision's win angle?",
  "Who are the likely evaluators?",
  "What FAR clauses apply?",
  "Draft an executive summary",
];

function OpportunityDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: opp, isLoading, error } = useOpportunity(id);
  const analyzeOpp = useAnalyzeOpportunity();
  const updateStage = useUpdateStage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-gda-panel" />
        <div className="grid gap-4 lg:grid-cols-[55%_45%]">
          <Skeleton className="h-60 bg-gda-panel" />
          <Skeleton className="h-60 bg-gda-panel" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  if (!opp) return null;

  const llm = opp.llm_analysis as LlmAnalysis | null | undefined;
  const currentStage = opp.pipeline_stage ? stageKeyToLabel(opp.pipeline_stage) : (opp.stage ?? "Interest");
  const timeline = opp.analysis?.timeline;
  const doctrine = opp.doctrine_badge;
  const doctrineScore = opp.doctrine_score;

  return (
    <div className="space-y-4">
      {/* ─── Header Strip ─────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => router.push("/opportunities")}
          className="cursor-pointer text-xs text-muted-foreground hover:text-gda-green"
        >
          ← Opportunities
        </button>
        <h1 className="mt-1 font-mono text-lg font-bold text-foreground">
          {opp.title}
        </h1>

        {/* Stage Stepper */}
        <div className="mt-3 flex items-center gap-1">
          {STAGES.map((stage, idx) => {
            const stageIdx = STAGES.indexOf(currentStage as ActiveStage);
            const isCurrent = stage === currentStage;
            const isCompleted = idx < stageIdx;
            return (
              <div key={stage} className="flex items-center gap-1">
                {idx > 0 && (
                  <div className={cn("h-px w-6", isCompleted || isCurrent ? "bg-gda-green" : "bg-border")} />
                )}
                <button
                  type="button"
                  onClick={() => updateStage.mutate({ id, stage })}
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-mono transition-colors",
                    isCurrent && "text-gda-green font-bold",
                    isCompleted && "text-gda-green",
                    !isCurrent && !isCompleted && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-[11px]">{isCompleted || isCurrent ? "●" : "○"}</span>
                  {stage}
                </button>
              </div>
            );
          })}
        </div>

        {/* Badge strip */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(opp.department || opp.agency) && (
            <Badge variant="outline" className="text-xs">
              {(() => {
                const segments = [
                  { label: "department", value: opp.department },
                  { label: "agency_name", value: opp.agency_name },
                  { label: "office", value: opp.office },
                  { label: "contracting_office", value: opp.contracting_office },
                ].filter((s) => Boolean(s.value));
                if (segments.length === 0 && opp.agency) {
                  return (
                    <button
                      type="button"
                      className="hover:text-gda-green cursor-pointer"
                      onClick={() => router.push(`/opportunities?agency=${encodeURIComponent(opp.agency!)}`)}
                    >
                      {opp.agency}
                    </button>
                  );
                }
                return segments.map((seg, idx) => (
                  <span key={seg.label}>
                    {idx > 0 && <span className="text-muted-foreground">{" > "}</span>}
                    <button
                      type="button"
                      className="hover:text-gda-green cursor-pointer"
                      onClick={() => router.push(`/opportunities?agency=${encodeURIComponent(seg.value!)}`)}
                    >
                      {seg.value}
                    </button>
                  </span>
                ));
              })()}
            </Badge>
          )}
          {opp.naics && (
            <Badge variant="outline" className="text-xs font-mono">NAICS {opp.naics}</Badge>
          )}
          {opp.set_aside && (
            <Badge variant="outline" className="text-xs">{opp.set_aside}</Badge>
          )}
          {opp.source && <SourceChip label={opp.source} kind="real" />}
          {opp.source_uri && (
            <a
              href={opp.source_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gda-cyan hover:text-gda-green transition-colors"
            >
              Source ↗
            </a>
          )}
          {(opp.response_deadline ?? opp.due_date) ? (
            <DueCountdown dueDate={opp.response_deadline ?? opp.due_date} />
          ) : (
            <FieldStatusBadge
              reason={
                opp.relevance_reason && /R[13]/.test(opp.relevance_reason)
                  ? "validation_cleared"
                  : "no_source_data"
              }
            />
          )}
        </div>
      </div>

      <Separator className="bg-border" />

      {/* ─── Two-Column Layout ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[55%_1fr]">
        {/* ═══ COLUMN A ═══ */}
        <div className="space-y-4">
          {/* Decision Brief */}
          <DecisionBriefPanel llm={llm} oppId={id} canonicalPwin={opp.pwin?.score ?? null} analyzing={analyzeOpp.isPending || analyzeOpp.analysisState === "analyzing"} onAnalyze={() => analyzeOpp.mutate(id)} llmErrorKind={analyzeOpp.llmError ?? opp.llm_error_kind} relevanceStatus={opp.relevance_status} relevanceReason={opp.relevance_reason} />

          {/* Competitive Intelligence */}
          <CompetitiveIntelPanel llm={llm} incumbent={opp.pwin?.incumbent_competitor} />

          {/* Risks */}
          <RisksPanel llm={llm} />

          {/* Ask AI — inline, always open */}
          <AskAiInline id={id} title={opp.title} agency={opp.agency} pwin={opp.pwin?.score} />
        </div>

        {/* ═══ COLUMN B ═══ */}
        <div className="space-y-4">
          {/* Metadata Rail */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <MetaRow label="Department" value={opp.department ?? "---"} />
              <MetaRow label="Agency" value={opp.agency_name ?? opp.agency ?? "---"} />
              {opp.office && <MetaRow label="Office" value={opp.office} />}
              {opp.contracting_office && <MetaRow label="Contracting" value={opp.contracting_office} />}
              {opp.is_idiq ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Value</span>
                  <span className={IDIQ_BADGE_CLS}>IDIQ (ceiling TBD)</span>
                </div>
              ) : opp.value_max || opp.value_min || opp.value ? (
                <MetaRow label="Value" value={formatMoney(opp.value_max ?? opp.value_min ?? opp.value ?? null)} mono />
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Value</span>
                  <FieldStatusBadge reason="no_source_data" />
                </div>
              )}
              <MetaRow label="Solicitation" value={opp.solicitation_number ?? "---"} mono />
              <MetaRow label="Posted" value={opp.posted_at ? new Date(opp.posted_at).toLocaleDateString() : "---"} />
              <MetaRow label="Set-Aside" value={opp.set_aside ?? "None"} />
              <MetaRow label="Place" value={opp.place_of_performance ?? "---"} />
              <MetaRow label="NAICS" value={opp.naics ?? "---"} mono />
              <MetaRow label="Source" value={opp.source ?? "---"} />
              {/* Doctrine Fit — demoted to one line */}
              {(doctrine || doctrineScore != null) && (
                <MetaRow
                  label="Doctrine Fit"
                  value={doctrine ? `${doctrine.label} ${Math.round((doctrine.score / 100) * 40)}/40` : `${doctrineScore}/40`}
                  className={doctrine ? FIT_COLORS[doctrine.label] : "text-gda-cyan"}
                />
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <TimelineEntry label="Posted" date={opp.posted_at} filled />
              <TimelineEntry label="RFP Release" date={timeline?.rfp_release ?? opp.posted_at} filled />
              <TimelineEntry
                label="Proposals Due"
                date={timeline?.proposals_due ?? opp.response_deadline}
                filled={!!(timeline?.proposals_due ?? opp.response_deadline)}
                urgent={isUrgent(timeline?.proposals_due ?? opp.response_deadline)}
              />
              <TimelineEntry label="Award Estimate" date={timeline?.award_estimate} filled={false} />
            </CardContent>
          </Card>

          {/* Stage Actions */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Next Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Current: <span className="text-gda-green font-mono">{currentStage}</span>
              </p>
              <div className="space-y-1">
                {(STAGE_ACTIONS[currentStage] ?? []).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => action.stage && updateStage.mutate({ id, stage: action.stage })}
                    disabled={updateStage.isPending}
                    className="block w-full text-left rounded border border-border px-3 py-1.5 text-xs font-mono text-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors disabled:opacity-50"
                  >
                    → {action.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Vault Documents */}
          <VaultDocumentsSection opportunityId={Number(id)} />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DueCountdown({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return <span className="font-mono text-xs font-bold text-gda-red">PAST DUE</span>;
  }
  if (diffDays <= 7) {
    return (
      <span className="flex items-center gap-1 font-mono text-xs font-bold text-gda-red">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gda-red animate-pulse" />
        {diffDays}d remaining
      </span>
    );
  }
  if (diffDays <= 30) {
    return <span className="font-mono text-xs text-gda-amber">{diffDays}d remaining</span>;
  }
  return <span className="font-mono text-xs text-muted-foreground">{due.toLocaleDateString()}</span>;
}

function isUrgent(date?: string | null): boolean {
  if (!date) return false;
  const diff = new Date(date).getTime() - Date.now();
  return diff > 0 && diff <= 7 * 86400 * 1000;
}

const SHIPLEY_DIMENSIONS: Array<{
  key: keyof import("@/lib/types").ShipleyBidNoBid;
  label: string;
}> = [
  { key: "customer_knowledge", label: "Customer Knowledge" },
  { key: "solution_match", label: "Solution Match" },
  { key: "competitive_position", label: "Competitive Position" },
  { key: "past_performance", label: "Past Performance" },
];

const BID_BADGE_COLORS: Record<string, string> = {
  Bid: "bg-gda-green/20 border-gda-green text-gda-green",
  "No Bid": "bg-gda-red/10 border-gda-red text-gda-red",
  Conditional: "bg-gda-amber/10 border-gda-amber text-gda-amber",
};

function DecisionBriefPanel({
  llm,
  canonicalPwin,
  analyzing,
  onAnalyze,
  llmErrorKind,
  relevanceStatus,
  relevanceReason,
}: {
  llm?: LlmAnalysis | null;
  oppId: string;
  canonicalPwin?: number | null;
  analyzing: boolean;
  onAnalyze: () => void;
  llmErrorKind?: string | null;
  relevanceStatus?: string | null;
  relevanceReason?: string | null;
}) {
  if (!llm) {
    // Pre-assessment gate: opportunities that failed the cheap relevance
    // filter are shown as a fast verdict instead of triggering an expensive
    // full analysis. Only 'relevant' (or null/unknown legacy rows) get the
    // Run Analysis path below.
    const isPreAssessed =
      relevanceStatus === "off_profile" ||
      relevanceStatus === "auto_pass" ||
      relevanceStatus === "unknown_naics";
    if (isPreAssessed) {
      const preLabel =
        relevanceStatus === "auto_pass"
          ? "Auto-passed"
          : relevanceStatus === "off_profile"
            ? "Off profile"
            : "NAICS unverified";
      const preColor =
        relevanceStatus === "auto_pass"
          ? "border-gda-amber/40 text-gda-amber"
          : "border-gda-red/40 text-gda-red";
      return (
        <Card className="border-border bg-gda-panel">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
              Decision Brief
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 py-4">
            <div>
              <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">
                Pre-Assessment
              </p>
              <Badge className={cn("text-sm font-mono font-bold px-3 py-1 border", preColor)}>
                {preLabel}
              </Badge>
            </div>
            {relevanceReason && (
              <p className="text-xs text-muted-foreground leading-relaxed font-mono">
                {relevanceReason}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              Skipped full analysis (not a fit). Run a full analysis manually if you disagree.
            </p>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzing}
              className="rounded border border-gda-green/30 px-3 py-1.5 text-xs font-mono text-gda-green/80 hover:bg-gda-green/10 transition-colors disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze Anyway"}
            </button>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Decision Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          {analyzing ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-gda-cyan animate-pulse" />
                <p className="text-xs text-gda-cyan font-mono font-semibold">
                  Analyzing... (thinking)
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground/60 font-mono">
                AI analysis in progress - results will appear shortly
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3 font-mono">
                Analysis pending
              </p>
              {llmErrorKind && (
                <p className="text-[11px] text-gda-red/80 mb-2 font-mono">
                  Error: {llmErrorKind}
                </p>
              )}
              <button
                type="button"
                onClick={onAnalyze}
                className="rounded border border-gda-green/40 px-3 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/10 transition-colors"
              >
                Run Analysis
              </button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const bidRec = llm.bid_recommendation ?? llm.shipley_bid_no_bid.overall;
  const bidColor = BID_BADGE_COLORS[bidRec] ?? "border-border text-muted-foreground";
  // Use canonical pwin (single source of truth, #849) — same value shown on list
  const pwinScore = canonicalPwin ?? llm.win_probability;
  const pwinColor = pwinScore >= 70 ? "text-gda-green" : pwinScore >= 40 ? "text-gda-amber" : "text-gda-red";

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Decision Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendation badge */}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Recommendation</p>
          <Badge className={cn("text-sm font-mono font-bold px-3 py-1 border", bidColor)}>
            {bidRec}
          </Badge>
        </div>

        {/* Executive summary */}
        {llm.executive_summary && (
          <p className="text-xs text-foreground leading-relaxed">
            {llm.executive_summary}
          </p>
        )}

        {/* Win Probability */}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Win Probability</p>
          <div className="flex items-baseline gap-2">
            <span className={cn("font-mono text-4xl font-bold", pwinColor)}>
              {pwinScore}%
            </span>
          </div>
          {llm.win_probability_reasoning && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {llm.win_probability_reasoning}
            </p>
          )}
        </div>

        {/* Shipley Dimensions */}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-2">Shipley Dimensions</p>
          <div className="space-y-1.5">
            {SHIPLEY_DIMENSIONS.map((dim) => {
              const d = llm.shipley_bid_no_bid[dim.key] as ShipleyDimension | undefined;
              if (!d) return null;
              return (
                <div key={dim.key} className="flex items-center gap-2 text-xs">
                  <span className="w-40 text-muted-foreground">{dim.label}</span>
                  <span className="font-mono text-foreground w-10">{d.score}/10</span>
                  <div className="flex-1 h-1.5 rounded bg-gda-panel overflow-hidden border border-border">
                    <div
                      className="h-full rounded bg-gda-green"
                      style={{ width: `${d.score * 10}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompetitiveIntelPanel({
  llm,
  incumbent,
}: {
  llm?: LlmAnalysis | null;
  incumbent?: string | null;
}) {
  const competitors = llm?.competitive_landscape ?? [];

  if (!llm) return null;

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Competitive Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {competitors.length > 0 ? (
          <>
            <div>
              <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Likely Competitors</p>
              <div className="space-y-1">
                {competitors.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-foreground whitespace-nowrap font-medium">
                      {c.name}
                    </span>
                    {c.threat_level && (
                      <Badge variant="outline" className={cn(
                        "text-[11px]",
                        c.threat_level === "high" && "text-gda-red border-gda-red/30",
                        c.threat_level === "medium" && "text-gda-amber border-gda-amber/30",
                        c.threat_level === "low" && "text-gda-cyan border-gda-cyan/30",
                      )}>
                        {c.threat_level}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{c.our_differentiator}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Competitive landscape not yet analyzed
          </p>
        )}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Incumbent</p>
          {incumbent ? (
            <span className="text-xs text-foreground font-mono">{incumbent}</span>
          ) : (
            <FieldStatusBadge
              reason={
                /* TODO: use opp.pwin?.incumbent_source once issue #793 ships */
                "no_source_data"
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const RISK_LEVEL_COLORS: Record<string, string> = {
  HIGH: "bg-gda-red/10 text-gda-red border-gda-red/30",
  MED: "bg-gda-amber/10 text-gda-amber border-gda-amber/30",
  LOW: "bg-gda-cyan/10 text-gda-cyan border-gda-cyan/30",
};

function RisksPanel({ llm }: { llm?: LlmAnalysis | null }) {
  const risks = llm?.risks ?? [];

  if (!llm) return null;
  if (risks.length === 0) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Risks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No risks analyzed yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Risks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {risks.map((risk, i) => (
          <div key={i} className="text-xs space-y-0.5">
            <div className="flex items-start gap-2">
              <Badge className={cn("text-[11px] font-mono border shrink-0", RISK_LEVEL_COLORS[risk.level] ?? "text-muted-foreground")}>
                {risk.level}
              </Badge>
              <span className="text-foreground">{risk.description}</span>
            </div>
            {risk.mitigation && (
              <p className="ml-12 text-muted-foreground">Mitigation: {risk.mitigation}</p>
            )}
            {risk.regulatory_citation && (
              <a
                href={`https://www.acquisition.gov/far/${risk.regulatory_citation.replace(/\s/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-12 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-mono text-gda-cyan hover:border-gda-cyan/40 transition-colors"
              >
                {risk.regulatory_citation}
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetaRow({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && "font-mono", className ?? "text-foreground")}>{value}</span>
    </div>
  );
}

function TimelineEntry({ label, date, filled, urgent }: { label: string; date?: string | null; filled?: boolean; urgent?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn("text-[11px]", filled ? "text-gda-green" : "text-muted-foreground")}>
        {filled ? "●" : "○"}
      </span>
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className={cn(
        "font-mono",
        urgent ? "text-gda-red font-bold" : "text-foreground"
      )}>
        {date ? new Date(date).toLocaleDateString() : "—"}
      </span>
    </div>
  );
}

function AskAiInline({ id, title, agency, pwin }: { id: string; title: string; agency: string | null; pwin?: number | null }) {
  const [question, setQuestion] = useState("");
  const askAi = useAskAi();

  function handleAsk(q?: string) {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    askAi.mutate({
      question: text,
      object_type: "opportunity",
      object_id: id,
      context: { title, agency, pwin },
    });
  }

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Analyst Q&A
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors"
              onClick={() => { setQuestion(chip); handleAsk(chip); }}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask about this opportunity..."
            className="flex-1 rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleAsk()}
            disabled={askAi.isPending || !question.trim()}
            className="rounded bg-gda-green/20 border border-gda-green/40 px-3 py-1 text-xs font-mono text-gda-green hover:bg-gda-green/30 transition-colors disabled:opacity-50"
          >
            {askAi.isPending ? "..." : "Send"}
          </button>
        </div>
        {askAi.data && (
          <div className="rounded border border-border bg-gda-bg-base p-3 text-xs text-foreground whitespace-pre-wrap">
            {askAi.data.answer
              ? askAi.data.answer
              : <span className="text-muted-foreground italic">Processing...</span>}
          </div>
        )}
        {askAi.error && (
          <p className="text-[11px] text-gda-red">{(askAi.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function VaultDocumentsSection({ opportunityId }: { opportunityId: number }) {
  const { data } = useVaultDocuments({ limit: 100 });
  const linkedDocs = (data?.items ?? []).filter(
    (d) => d.linked_opportunity_id === opportunityId,
  );

  if (linkedDocs.length === 0) return null;

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {linkedDocs.map((doc) => (
          <Link
            key={doc.id}
            href={`/vault?doc=${doc.id}`}
            className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2 text-xs hover:border-gda-cyan/40 transition-colors"
          >
            <span className="font-mono text-foreground">{doc.filename}</span>
            <span className="text-muted-foreground">{doc.doc_type}</span>
            {doc.ai_summary && (
              <span className="text-muted-foreground truncate max-w-[200px]">{doc.ai_summary}</span>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
