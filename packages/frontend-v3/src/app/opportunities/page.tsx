"use client";

import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useOpportunitiesInfinite,
  useOpportunity,
  useAnalyzeOpportunity,
  useUpdateStage,
  type OpportunityMeta,
} from "@/hooks/use-opportunities";
import { useVehicles, useVehicleOpportunities, type VehicleSummary, type VehicleOpportunity } from "@/hooks/use-vehicles";
import { useAskAi } from "@/hooks/use-llm";
import { apiPost } from "@/lib/api";
import { SourceChip } from "@/components/shared/source-chip";
import { ErrorState } from "@/components/shared/error-state";
import { useVaultDocuments } from "@/hooks/use-vault";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type {
  DoctrineFitLabel,
  LlmAnalysis,
  ShipleyDimension,
  OpportunitySummary,
} from "@/lib/types";

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

  if (detailId) return <OpportunityDetail id={detailId} />;
  return <OpportunityList />;
}

/* ── Stage tabs config ──────────────────────────────────────────── */

const STAGE_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "qualifying", label: "Interest" },
  { key: "pursuit", label: "Qualified" },
  { key: "proposal", label: "Capture" },
  { key: "submitted", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;

/* ── Urgency heat helpers ───────────────────────────────────────── */

function getHeatColor(opp: OpportunitySummary): string | null {
  const daysLeft = getDaysLeft(opp);
  if (daysLeft !== null && (daysLeft <= 7 || daysLeft < 0)) return "border-l-gda-red";
  if (daysLeft !== null && daysLeft <= 30) return "border-l-gda-amber";
  const grade = opp.pwin?.band === "forecast" ? "A" : opp.pwin?.band === "signal" ? "B" : null;
  const pipelineStage = opp.pipeline_stage;
  if (grade === "A" && !pipelineStage) return "border-l-gda-cyan";
  if (grade === "A" && pipelineStage) return "border-l-gda-green";
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

/* ── Stage badge colors ─────────────────────────────────────────── */

const STAGE_BADGE_STYLES: Record<string, string> = {
  qualifying: "border-muted text-muted-foreground",
  pursuit: "border-gda-cyan text-gda-cyan",
  proposal: "border-gda-amber text-gda-amber",
  submitted: "border-gda-green text-gda-green",
  won: "bg-gda-green/20 text-gda-green border-transparent",
  lost: "bg-gda-red/10 text-gda-red border-transparent",
};

const STAGE_DISPLAY: Record<string, string> = {
  qualifying: "Interest",
  pursuit: "Qualified",
  proposal: "Capture",
  submitted: "Proposal",
  evaluation: "Evaluation",
  won: "Won",
  lost: "Lost",
};

/* ── Value range options ────────────────────────────────────────── */

const VALUE_RANGES = [
  { label: "Any Value", min: undefined, max: undefined },
  { label: "<$1M", min: undefined, max: 1_000_000 },
  { label: "$1M–$10M", min: 1_000_000, max: 10_000_000 },
  { label: "$10M–$50M", min: 10_000_000, max: 50_000_000 },
  { label: "$50M–$100M", min: 50_000_000, max: 100_000_000 },
  { label: ">$100M", min: 100_000_000, max: undefined },
] as const;

/* ── Due options ────────────────────────────────────────────────── */

const DUE_OPTIONS = [
  { label: "Any Due", value: "" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "Next 90 Days", value: "next_90" },
  { label: "Past Due", value: "past_due" },
] as const;

/* ── Source options ──────────────────────────────────────────────── */

const SOURCE_OPTIONS = ["SAM", "GovTribe", "GovWin", "manual"] as const;

/* ── Set-aside options ──────────────────────────────────────────── */

const SET_ASIDE_OPTIONS = [
  "SDVOSB", "8(a)", "HUBZone", "WOSB", "SB", "Unrestricted",
] as const;

/* ── Grade options ──────────────────────────────────────────────── */

const GRADE_OPTIONS = ["A", "B", "C", "D", "F", "Unscored"] as const;

/* ══════════════════════════════════════════════════════════════════ */

function OpportunityList() {
  const router = useRouter();

  // Filter state
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [setAsideFilter, setSetAsideFilter] = useState<string[]>([]);
  const [valueRange, setValueRange] = useState(0);
  const [dueFilter, setDueFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [stageTab, setStageTab] = useState("all");
  const [groupBy, setGroupBy] = useState<"none" | "vehicle">("none");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);

  const filterParams = useMemo(() => {
    const range = VALUE_RANGES[valueRange];
    return {
      q: debouncedQ || undefined,
      agency: agencyFilter || undefined,
      grades: gradeFilter.length > 0 ? gradeFilter : undefined,
      set_asides: setAsideFilter.length > 0 ? setAsideFilter : undefined,
      value_min: range?.min,
      value_max: range?.max,
      due: dueFilter || undefined,
      sources: sourceFilter.length > 0 ? sourceFilter : undefined,
      stage: stageTab !== "all" ? stageTab : undefined,
      relevant_only: relevantOnly,
      limit: 50,
    };
  }, [debouncedQ, agencyFilter, gradeFilter, setAsideFilter, valueRange, dueFilter, sourceFilter, stageTab, relevantOnly]);

  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpportunitiesInfinite(filterParams);

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const meta: OpportunityMeta | undefined = data?.pages[0]?.meta;

  // Vehicle grouping
  const { data: vehiclesData, isLoading: vehiclesLoading } = useVehicles();

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    debouncedQ || agencyFilter || gradeFilter.length > 0 || setAsideFilter.length > 0 ||
    valueRange !== 0 || dueFilter || sourceFilter.length > 0;

  const handleClearFilters = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ("");
    setDebouncedQ("");
    setAgencyFilter("");
    setGradeFilter([]);
    setSetAsideFilter([]);
    setValueRange(0);
    setDueFilter("");
    setSourceFilter([]);
  }, []);

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

  const handleUnscoredClick = useCallback(() => {
    setGradeFilter((prev) =>
      prev.includes("Unscored")
        ? prev.filter((g) => g !== "Unscored")
        : [...prev, "Unscored"],
    );
  }, []);

  const handleGradeAClick = useCallback(() => {
    setGradeFilter((prev) =>
      prev.includes("A") ? prev.filter((g) => g !== "A") : [...prev, "A"],
    );
  }, []);

  // Compute stage tab counts from meta
  const getStageCount = useCallback(
    (key: string): number => {
      if (!meta) return 0;
      if (key === "all") return meta.total_count;
      if (key === "active") {
        const sc = meta.stage_counts;
        return Object.entries(sc)
          .filter(([k]) => !["won", "lost"].includes(k))
          .reduce((sum, [, v]) => sum + v, 0);
      }
      return meta.stage_counts[key] ?? 0;
    },
    [meta],
  );

  return (
    <div className="space-y-4">
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
            active={gradeFilter.includes("Unscored")}
            onClick={handleUnscoredClick}
          />
          <IntelChip
            icon="$"
            label={`${formatMoney(meta.total_value)} Total Value`}
            active={false}
          />
          <IntelChip
            icon="A"
            label={`${meta.grade_a_count} Grade A`}
            active={gradeFilter.includes("A")}
            onClick={handleGradeAClick}
          />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search title, agency, solicitation #…"
          value={q}
          onChange={handleSearchChange}
          className="flex-grow min-w-[200px] rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        />
        <input
          type="text"
          placeholder="Agency…"
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          className="w-[130px] rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        />
        <MultiSelect
          label="Grade"
          options={GRADE_OPTIONS as unknown as string[]}
          selected={gradeFilter}
          onToggle={(v) => toggleArrayFilter(setGradeFilter, v)}
        />
        <MultiSelect
          label="Set-Aside"
          options={SET_ASIDE_OPTIONS as unknown as string[]}
          selected={setAsideFilter}
          onToggle={(v) => toggleArrayFilter(setSetAsideFilter, v)}
        />
        <select
          value={valueRange}
          onChange={(e) => setValueRange(Number(e.target.value))}
          className="rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          {VALUE_RANGES.map((r, i) => (
            <option key={i} value={i}>{r.label}</option>
          ))}
        </select>
        <select
          value={dueFilter}
          onChange={(e) => setDueFilter(e.target.value)}
          className="rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          {DUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <MultiSelect
          label="Source"
          options={SOURCE_OPTIONS as unknown as string[]}
          selected={sourceFilter}
          onToggle={(v) => toggleArrayFilter(setSourceFilter, v)}
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
              {/* Table */}
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                      <th className="w-[3px] p-0" />
                      <th className="px-3 py-2 text-left font-medium">Title</th>
                      <th className="px-3 py-2 text-left font-medium w-[140px]">Agency</th>
                      <th className="px-3 py-2 text-left font-medium w-[100px]">Value</th>
                      <th className="px-3 py-2 text-left font-medium w-[70px]">Grade</th>
                      <th className="px-3 py-2 text-left font-medium w-[90px]">Stage</th>
                      <th className="px-3 py-2 text-left font-medium w-[80px]">Due</th>
                      <th className="px-3 py-2 text-left font-medium w-[60px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((opp) => (
                      <OpportunityRow
                        key={String(opp.internal_id ?? opp.id)}
                        opp={opp}
                        onNavigate={(id) => router.push(`/opportunities?id=${id}`)}
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

              {/* Infinite scroll sentinel */}
              <div ref={scrollSentinelRef} className="h-1" />
              {isFetchingNextPage && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 bg-gda-panel" />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
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

/* ── Multi-select dropdown ──────────────────────────────────────── */

function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "rounded border bg-gda-panel px-2 py-1.5 text-xs transition-colors flex items-center gap-1",
          selected.length > 0
            ? "border-gda-green text-gda-green"
            : "border-border text-foreground",
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-gda-green/20 text-gda-green rounded-full px-1 text-[11px]">
            {selected.length}
          </span>
        )}
        <span className="text-muted-foreground ml-0.5">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded border border-border bg-gda-panel shadow-lg py-1 min-w-[140px]">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={cn(
                "w-full text-left px-3 py-1 text-xs hover:bg-gda-green/10 transition-colors flex items-center gap-2",
                selected.includes(opt) ? "text-gda-green" : "text-foreground",
              )}
            >
              <span className="w-3">{selected.includes(opt) ? "x" : ""}</span>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Vehicle grouped view ───────────────────────────────────────── */

function VehicleGroupedView({
  vehicles,
  onNavigate,
}: {
  vehicles: VehicleSummary[];
  onNavigate: (id: number | string) => void;
}) {
  return (
    <div className="space-y-4">
      {vehicles.map((vehicle) => (
        <VehicleGroup key={vehicle.id} vehicle={vehicle} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function VehicleGroup({
  vehicle,
  onNavigate,
}: {
  vehicle: VehicleSummary;
  onNavigate: (id: number | string) => void;
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
              <VehicleOpportunityRow key={opp.id} opp={opp} onNavigate={onNavigate} />
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
}: {
  opp: VehicleOpportunity;
  onNavigate: (id: number | string) => void;
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
            <span className="text-[11px] font-mono text-muted-foreground">{opp.agency}</span>
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
        {opp.value_max && (
          <span>{formatMoney(opp.value_max)}</span>
        )}
        {opp.pipeline_stage && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px]">
            {opp.pipeline_stage}
          </span>
        )}
        {opp.response_due_at && (
          <span>
            {new Date(opp.response_due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Table row with heat bar + hover actions ────────────────────── */

function OpportunityRow({
  opp,
  onNavigate,
}: {
  opp: OpportunitySummary;
  onNavigate: (id: number | string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const heat = getHeatColor(opp);
  const daysLeft = formatDaysLeft(opp);
  const pipelineStage = opp.pipeline_stage;
  const score = opp.pwin?.score;
  const band = opp.pwin?.band;
  const gradeLabel =
    band === "forecast" ? "A" : band === "signal" ? "B" : band === "discovery" ? "C" : band === "pass" ? "D" : null;

  const sources: string[] = [];
  if (opp.data_source) sources.push(opp.data_source);
  if (opp.source && opp.source !== opp.data_source) sources.push(opp.source);

  return (
    <tr
      className={cn(
        "border-b border-border hover:bg-gda-panel/50 transition-colors h-9",
        heat ? `border-l-[3px] ${heat}` : "border-l-[3px] border-l-transparent",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[140px]">
        {opp.agency ?? "---"}
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-foreground tabular-nums">
        {formatMoney(getEffectiveValue(opp))}
      </td>
      <td className="px-3 py-1.5 text-left">
        {score != null && gradeLabel ? (
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-gda-green">{score}</span>
            <span className="rounded border border-border px-1 py-0.5 text-[11px] font-mono">
              {gradeLabel}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">---</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {pipelineStage ? (
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[11px] font-mono",
              STAGE_BADGE_STYLES[pipelineStage] ?? "border-border text-muted-foreground",
            )}
          >
            {STAGE_DISPLAY[pipelineStage] ?? pipelineStage}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">---</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <span className={cn("text-xs", daysLeft.className)}>{daysLeft.text}</span>
      </td>
      <td className="px-3 py-1.5">
        {hovered ? (
          <div className="flex items-center gap-1">
            {opp.source_uri && (
              <a
                href={opp.source_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-muted-foreground hover:text-gda-cyan transition-colors"
                title="View source"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => onNavigate(opp.id)}
              className="text-[11px] font-mono text-muted-foreground hover:text-gda-green transition-colors"
              title="View detail"
            >
              {"->"}
            </button>
            <button
              type="button"
              onClick={() => {
                void apiPost("/v3/captures", { opportunity_id: String(opp.id) }).catch(() => {
                  // capture may already exist or need pipeline item
                });
                onNavigate(opp.id);
              }}
              className="text-[11px] font-mono text-muted-foreground hover:text-gda-green transition-colors"
              title="Start capture"
            >
              +
            </button>
          </div>
        ) : (
          <Link
            href={`/opportunities?id=${opp.id}`}
            className="text-[11px] font-mono text-muted-foreground hover:text-gda-green"
          >
            {"->"}
          </Link>
        )}
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

// ─── Stage constants ─────────────────────────────────────────────────────────
const STAGES = ["Interest", "Qualified", "Capture", "Proposal", "Won"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_ACTIONS: Record<string, Array<{ label: string; stage?: string }>> = {
  Interest: [
    { label: "Qualify", stage: "Qualified" },
    { label: "No-Bid", stage: "No-Bid" },
    { label: "Add to Watch List" },
  ],
  Qualified: [
    { label: "Start Capture", stage: "Capture" },
    { label: "Request More Info" },
    { label: "No-Bid", stage: "No-Bid" },
  ],
  Capture: [
    { label: "Start Proposal", stage: "Proposal" },
    { label: "Run Color Team" },
    { label: "No-Bid", stage: "No-Bid" },
  ],
  Proposal: [
    { label: "Submit", stage: "Won" },
    { label: "Request Extension" },
    { label: "Withdraw", stage: "Lost" },
  ],
};

const SUGGESTION_CHIPS = [
  "What's Envision's win angle?",
  "Who are the likely evaluators?",
  "What FAR clauses apply?",
  "Draft an executive summary",
];

function OpportunityDetail({ id }: { id: string }) {
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
  const currentStage = (opp.pipeline_stage ? (STAGE_DISPLAY[opp.pipeline_stage] ?? opp.pipeline_stage) : null) ?? opp.stage ?? "Interest";
  const timeline = opp.analysis?.timeline;
  const doctrine = opp.doctrine_badge;
  const doctrineScore = opp.doctrine_score;

  return (
    <div className="space-y-4">
      {/* ─── Header Strip ─────────────────────────────────────────────── */}
      <div>
        <Link
          href="/opportunities"
          className="text-xs text-muted-foreground hover:text-gda-green"
        >
          ← Opportunities
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold text-foreground">
          {opp.title}
        </h1>

        {/* Stage Stepper */}
        <div className="mt-3 flex items-center gap-1">
          {STAGES.map((stage, idx) => {
            const stageIdx = STAGES.indexOf(currentStage as Stage);
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
          {opp.agency && (
            <Badge variant="outline" className="text-xs">{opp.agency}</Badge>
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
          <DueCountdown dueDate={opp.response_deadline ?? opp.due_date} />
        </div>
      </div>

      <Separator className="bg-border" />

      {/* ─── Two-Column Layout ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[55%_1fr]">
        {/* ═══ COLUMN A ═══ */}
        <div className="space-y-4">
          {/* Decision Brief */}
          <DecisionBriefPanel llm={llm} oppId={id} analyzing={analyzeOpp.isPending} onAnalyze={() => analyzeOpp.mutate(id)} llmErrorKind={opp.llm_error_kind} />

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
              <MetaRow label="Value" value={formatMoney(opp.value)} mono />
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
  analyzing,
  onAnalyze,
  llmErrorKind,
}: {
  llm?: LlmAnalysis | null;
  oppId: string;
  analyzing: boolean;
  onAnalyze: () => void;
  llmErrorKind?: string | null;
}) {
  if (!llm) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Decision Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-xs text-muted-foreground mb-3 font-mono">
            {analyzing ? "Analysis running..." : "Analysis pending"}
          </p>
          {llmErrorKind && !analyzing && (
            <p className="text-[11px] text-muted-foreground/60 mb-2 font-mono">
              {llmErrorKind}
            </p>
          )}
          {!analyzing && (
            <button
              type="button"
              onClick={onAnalyze}
              className="rounded border border-gda-green/40 px-3 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/10 transition-colors"
            >
              Run Analysis
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  const bidRec = llm.bid_recommendation ?? llm.shipley_bid_no_bid.overall;
  const bidColor = BID_BADGE_COLORS[bidRec] ?? "border-border text-muted-foreground";
  const pwinScore = llm.win_probability;
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
        {incumbent && (
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Incumbent</p>
            <span className="text-xs text-foreground font-mono">{incumbent}</span>
          </div>
        )}
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
            {askAi.data.ok && askAi.data.output
              ? String((askAi.data.output as Record<string, unknown>).answer ?? JSON.stringify(askAi.data.output, null, 2))
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
