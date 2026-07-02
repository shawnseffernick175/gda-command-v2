"use client";

import { Suspense, useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useOpportunitiesPaged,
  useOpportunity,
  useAnalyzeOpportunity,
  useUpdateStage,
  type OpportunityMeta,
} from "@/hooks/use-opportunities";
import { usePipelineList, type PipelineListItem } from "@/hooks/use-pipeline";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/shared/Pagination";
import { useVehicles, useVehicleOpportunities, type VehicleSummary, type VehicleOpportunity } from "@/hooks/use-vehicles";
import { useAskAi } from "@/hooks/use-llm";
import { SourceChip } from "@/components/shared/source-chip";
import { FieldStatusBadge } from "@/components/field-status-badge";
import { ErrorState } from "@/components/shared/error-state";
import { useVaultDocuments } from "@/hooks/use-vault";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScoreExplain } from "@/components/shared/score-explainers";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { AnalysisBrief } from "@/components/analysis/AnalysisBrief";
import { isSmallBizPlay, sbPlayTooltip } from "@/lib/sb-play";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  STAGE_TABS as CANONICAL_STAGE_TABS,
  STAGE_ACTIONS as CANONICAL_STAGE_ACTIONS,
  STAGE_BADGE_STYLES as CANONICAL_BADGE_STYLES,
  ACTIVE_STAGES as CANONICAL_ACTIVE_STAGES,
  stageKeyToLabel,
  CANONICAL_STAGE_KEYS,
  DB_KEY_TO_LABEL,
  isStagingStage,
  type ActiveStage,
} from "@/lib/stages";
import type {
  DoctrineFitLabel,
  LlmAnalysis,
  OpportunitySummary,
} from "@/lib/types";
// DoctrineAlignmentPanel superseded by F-305 10-section SSE brief
// import { DoctrineAlignmentPanel } from "@/components/shared/DoctrineAlignmentPanel";
import { MarginFloorBanner } from "@/components/shared/MarginFloorBanner";
import { DoctrineOverrideModal } from "@/components/shared/DoctrineOverrideModal";
import { useDoctrineEvaluations } from "@/hooks/use-doctrine-evaluation";
import { useOpportunityAnalysis } from "@/hooks/use-opportunity-analysis";
import { DecisionBriefStream } from "@/components/opportunity-analysis/DecisionBriefStream";
import { CapabilityMatchCard } from "@/components/CapabilityMatchCard";
import { useGenerateBriefing, useGeneratedDocuments } from "@/hooks/use-output-generators";
import { PricingScenarioCard } from "@/components/shared/PricingScenarioCard";

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
  const isForecasted = opp.date_confidence === "forecasted" || opp.date_confidence === "estimated";
  if (isForecasted) {
    const d = new Date(getEffectiveDueDate(opp)!);
    const base = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { text: `~${base}`, className: "text-muted-foreground/70" };
  }
  if (days < 0) return { text: "PAST DUE", className: "text-gda-red font-mono font-bold italic" };
  if (days <= 7) return { text: `${days}d`, className: "text-gda-red font-mono font-bold" };
  if (days <= 30) return { text: `${days}d`, className: "text-gda-amber font-mono" };
  const d = new Date(getEffectiveDueDate(opp)!);
  const base = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { text: base, className: "text-muted-foreground" };
}

function isEstimatedValue(opp: OpportunitySummary): boolean {
  return opp.value_source === "govwin_estimate" || opp.value_source === "govtribe_estimate";
}

function formatValueWithSource(opp: OpportunitySummary): { text: string; className: string } {
  const val = getEffectiveValue(opp);
  if (val == null) return { text: "—", className: "text-muted-foreground" };
  const money = formatMoney(val);
  if (isEstimatedValue(opp)) {
    return { text: `~${money} est.`, className: "text-muted-foreground/70 tabular-nums" };
  }
  return { text: money, className: "text-foreground tabular-nums" };
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

  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [idiqFilter, setIdiqFilter] = useState<'only' | 'exclude' | undefined>(undefined);
  const [sbPlayOnly, setSbPlayOnly] = useState(false);
  const [stageTab, setStageTab] = useState("all");
  const [groupBy, setGroupBy] = useState<"none" | "vehicle">("none");
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [showQualifyQueue, setShowQualifyQueue] = useState(false);
  const qualifyStage = useUpdateStage();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const { sortBy, sortDir, handleSort, sortParams } = useTableSort();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterParams = useMemo(() => {
    const range = VALUE_RANGES[valueRange];
    return {
      q: debouncedQ || undefined,
      agency: agencyFilter || undefined,
      hot: hotFilter ? "1" : undefined,
      set_asides: setAsideFilter.length > 0 ? setAsideFilter : undefined,
      value_min: range?.min,
      value_max: range?.max,

      sources: sourceFilter.length > 0 ? sourceFilter : undefined,
      stage: stageTab !== "all" ? stageTab : undefined,
      relevant_only: relevantOnly,
      idiq: idiqFilter,
      sb_play: sbPlayOnly || undefined,
      sort_by: sortParams.sort_by,
      sort_dir: sortParams.sort_dir,
      limit: 50,
    };
  }, [debouncedQ, agencyFilter, hotFilter, setAsideFilter, valueRange, sourceFilter, stageTab, relevantOnly, idiqFilter, sbPlayOnly, sortParams.sort_by, sortParams.sort_dir]);

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
    valueRange !== 0 || sourceFilter.length > 0 || idiqFilter !== undefined || sbPlayOnly;

  const handleClearFilters = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ("");
    setDebouncedQ("");
    setAgencyFilter("");
    setHotFilter(false);
    setSetAsideFilter([]);
    setValueRange(0);
    setSourceFilter([]);
    setIdiqFilter(undefined);
    setSbPlayOnly(false);
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

  const handleHotClick = useCallback(() => {
    setHotFilter((prev) => !prev);
  }, []);

  const applyAgencyFilter = useCallback((value: string) => {
    setAgencyFilter(value);
    setPage(1);
  }, []);

  // Compute stage tab counts from meta.stage_counts (always computed from
  // baseWhere, without the active stage filter) so every tab badge reflects
  // its own independent count regardless of which tab is currently selected.
  const getStageCount = useCallback(
    (key: string): number => {
      if (!meta) return 0;
      const sc = meta.stage_counts;
      if (key === "all") {
        return Object.entries(sc)
          .filter(([k]) => k !== "qualify")
          .reduce((sum, [, v]) => sum + v, 0);
      }
      if (key === "active") {
        return Object.entries(sc)
          .filter(([k]) => !["won", "lost", "no_bid", "gov_cancelled", "passed", "qualify"].includes(k))
          .reduce((sum, [, v]) => sum + v, 0);
      }
      return sc[key] ?? 0;
    },
    [meta],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page header (stays above table scroll area) */}
      <div className="shrink-0 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4">
        {/* Page header */}
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
            Opportunities
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Every government opportunity in your wheelhouse — forecasts, sources
            sought, and active solicitations. Search and filter the list, open one
            to see its automatic analysis and PWin, and advance the ones worth
            pursuing into capture.
          </p>
        </div>

        {/* Intelligence bar */}
        {meta && (
          <div className="flex flex-wrap gap-2">
            <IntelChip
              icon="#"
              label={`${meta.total_count} Active`}
              active={false}
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
            {(meta.sb_play_count > 0 || sbPlayOnly) && (
              <IntelChip
                icon="S"
                label={`${meta.sb_play_count} SB Play`}
                active={sbPlayOnly}
                onClick={() => setSbPlayOnly((prev) => !prev)}
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
          <label
            className="flex items-center gap-1.5 cursor-pointer select-none"
            title="When checked, only shows opportunities matching Envision's IT and Consulting NAICS codes. Uncheck to see all opportunities."
          >
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
          <div className="ml-auto flex items-center gap-2 pl-3">
            <button
              type="button"
              disabled={qualifyStage.isPending}
              onClick={() => {
                if (selectedOppId) {
                  qualifyStage.mutate(
                    { id: selectedOppId, stage: "qualify" },
                    {
                      onSuccess: () => {
                        toast("Moved to Qualify staging", "success");
                        setSelectedOppId(null);
                      },
                      onError: (err) =>
                        toast(`Failed to qualify: ${err.message}`, "error"),
                    },
                  );
                } else {
                  setShowQualifyQueue((prev) => !prev);
                }
              }}
              title={selectedOppId ? "Move selected opportunity to Qualify staging" : "Toggle Qualify staging queue"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer",
                showQualifyQueue && !selectedOppId
                  ? "border-gda-green text-gda-green bg-gda-green/10"
                  : selectedOppId
                    ? "border-gda-green text-gda-green bg-gda-green/10 hover:bg-gda-green/20"
                    : "border-border text-muted-foreground hover:border-gda-green/50",
              )}
            >
              Qualify
            </button>
            <button
              type="button"
              onClick={() => setGroupBy(g => g === "none" ? "vehicle" : "none")}
              title="Group opportunities by contract vehicle (IDIQ, BPA, GSA schedule, etc.) instead of a flat list"
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
        <div className="shrink-0 mt-4">
          <ErrorState
            message={(error as Error).message}
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {/* Qualify staging queue */}
      {showQualifyQueue && !selectedOppId ? (
        <QualifyStagingQueue />
      ) : groupBy === "vehicle" ? (
        vehiclesLoading ? (
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 bg-gda-panel" />
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto mt-4">
            <VehicleGroupedView
              vehicles={vehiclesData ?? []}
              onNavigate={(id) => router.push(`/opportunities?id=${id}`)}
              onAgencyFilter={applyAgencyFilter}
            />
          </div>
        )
      ) : (
        <>
          {/* Loading skeleton */}
          {isLoading && allItems.length === 0 ? (
            <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 bg-gda-panel" />
              ))}
            </div>
          ) : (
            <>
              {/* Table — scroll container with sticky thead */}
              <div className="flex-1 min-h-0 mt-4 overflow-y-auto overflow-x-hidden rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gda-bg-base">
                    <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground [&>th]:sticky [&>th]:top-0 [&>th]:z-10">
                      <th className="w-[3px] p-0 bg-gda-bg-base" />
                      <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Agency" field="agency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="140px" />
                      <SortableHeader label="Value" field="value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" infoTooltip={<HeaderInfoTooltip text="Value pulled from SAM.gov when available. When SAM is missing the field, we fall back to GovWin and GovTribe estimates (shown with ~ and in muted color). Empty means no source had data." />} />
                      <SortableHeader label="Pwin" field="pwin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" infoTooltip={<HeaderInfoTooltip text="Probability of Win (0-100%). AI-scored from opportunity fit, competition, and Envision positioning. Green = forecast (65%+), amber = signal (45-64%), red = discovery (<45%)." />} />
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
                      <SortableHeader label="Due" field="due" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" infoTooltip={<HeaderInfoTooltip text="Due date pulled from SAM.gov when available. When SAM is missing the field, we fall back to GovWin and GovTribe forecasts (shown with ~ and in muted color). Empty means no source had data." />} />
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
                        selected={selectedOppId === String(opp.id)}
                        onSelect={(id) => setSelectedOppId((prev) => prev === id ? null : id)}
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
                <div className="shrink-0 mt-3 flex items-center justify-between gap-3">
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

/* ── Hot (Pwin ≥ 70%) chip with inline ? tooltip ────────────────── */

function HotChip({
  count,
  active,
  onClick,
}: {
  count: number;
  active: boolean;
  onClick?: () => void;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "bg-gda-panel border rounded px-3 py-1.5 text-xs font-mono transition-colors inline-flex items-center gap-1.5",
          active
            ? "border-gda-green text-gda-green bg-gda-green/10"
            : "border-border text-foreground",
          onClick
            ? "cursor-pointer hover:border-gda-green/40"
            : "cursor-default",
        )}
      >
        <svg className="inline-block h-3.5 w-3.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
        {count} Hot
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[11px] opacity-60">?</span>
      </button>
      {showTip && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded border border-border bg-gda-bg-raised p-2.5 text-xs text-muted-foreground shadow-lg normal-case font-normal">
          {"Hot = opportunities with Pwin (probability of win) \u2265 70%. Count reflects the current filter / tab."}
        </div>
      )}
    </span>
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

/* ── Header info tooltip (? popover) ─────────────────────────────── */

function HeaderInfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        type="button"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground hover:bg-gda-panel"
        aria-label="Column info"
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded border border-border bg-gda-bg-raised p-2.5 text-xs text-muted-foreground shadow-lg normal-case font-normal">
          {text}
        </div>
      )}
    </span>
  );
}

/* Inline SortableHeader removed — using shared component from @/components/shared/SortableHeader */

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
  selected,
  onSelect,
}: {
  opp: OpportunitySummary;
  onNavigate: (id: number | string) => void;
  onAgencyFilter?: (value: string) => void;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const updateStage = useUpdateStage();
  const heat = getHeatColor(opp);
  const daysLeft = formatDaysLeft(opp);
  const pipelineStage = opp.pipeline_stage;
  const score = opp.pwin?.score;
  const isSbPlay = isSmallBizPlay(opp.naics, opp.set_aside);
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

  return (
    <tr
      onClick={() => onSelect?.(String(opp.id))}
      className={cn(
        "border-b border-border hover:bg-gda-panel/50 transition-colors h-9 cursor-pointer",
        heat ? `border-l-[3px] ${heat}` : "border-l-[3px] border-l-transparent",
        isSbPlay && "bg-gda-green/[0.03]",
        selected && "bg-gda-green/[0.06] ring-1 ring-inset ring-gda-green/30",
      )}
    >
      <td className="p-0 w-0" />
      <td className="px-3 py-1.5">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/opportunities?id=${opp.id}`}
              className="text-foreground hover:text-gda-green truncate block max-w-xs text-sm"
            >
              {opp.title}
            </Link>
            {isSbPlay && (
              <span
                className="shrink-0 rounded border border-gda-green/40 bg-gda-green/10 px-1.5 py-0.5 text-[11px] font-mono font-bold text-gda-green"
                title={sbPlayTooltip(opp.naics, opp.set_aside)}
              >
                SB PLAY
              </span>
            )}
          </div>
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
      <td className="px-3 py-1.5 text-left font-mono text-xs tabular-nums">
        {opp.is_idiq ? (
          <span className={IDIQ_BADGE_CLS}>IDIQ</span>
        ) : (() => {
          const fv = formatValueWithSource(opp);
          return <span className={fv.className}>{fv.text}</span>;
        })()}
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
          {CANONICAL_STAGE_KEYS.filter((key) => !isStagingStage(key)).map((key) => (
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
        <RowActionsMenu
          opportunityId={String(opp.id)}
          sourceUri={opp.source_uri ?? null}
          currentTags={opp.tags ?? []}
        />
      </td>
    </tr>
  );
}

/* ── Qualify staging queue ───────────────────────────────────────── */

function QualifyStagingQueue() {
  const { data, isLoading } = usePipelineList({ stage: "qualify", limit: 200 });
  const updateStage = useUpdateStage();
  const { toast } = useToast();
  const router = useRouter();

  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 bg-gda-panel" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 min-h-0 mt-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No opportunities in the Qualify staging queue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 mt-4 overflow-y-auto overflow-x-clip rounded border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gda-bg-base">
          <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground uppercase tracking-wider">
            <th className="px-3 py-2 text-left font-medium">Opportunity</th>
            <th className="px-3 py-2 text-left font-medium w-[140px]">Agency</th>
            <th className="px-3 py-2 text-left font-medium w-[80px]">Pwin</th>
            <th className="px-3 py-2 text-left font-medium w-[100px]">Source</th>
            <th className="px-3 py-2 text-left font-medium w-[120px]">Date Staged</th>
            <th className="px-3 py-2 text-left font-medium w-[160px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <QualifyStagingRow
              key={item.id}
              item={item}
              onPromote={(id) => {
                updateStage.mutate(
                  { id, stage: "qualified" },
                  {
                    onSuccess: () => toast("Promoted to Qualified", "success"),
                    onError: (err) => toast(`Promote failed: ${err.message}`, "error"),
                  },
                );
              }}
              onReturn={(id) => {
                updateStage.mutate(
                  { id, stage: "interest" },
                  {
                    onSuccess: () => toast("Returned to Interest", "success"),
                    onError: (err) => toast(`Return failed: ${err.message}`, "error"),
                  },
                );
              }}
              onNavigate={(oppId) => router.push(`/opportunities?id=${oppId}`)}
              isPending={updateStage.isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QualifyStagingRow({
  item,
  onPromote,
  onReturn,
  onNavigate,
  isPending,
}: {
  item: PipelineListItem;
  onPromote: (oppId: string) => void;
  onReturn: (oppId: string) => void;
  onNavigate: (oppId: string) => void;
  isPending: boolean;
}) {
  const pwin = item.resolved_pwin;
  const pwinClass =
    pwin == null
      ? "text-muted-foreground"
      : pwin >= 65
        ? "text-gda-green"
        : pwin >= 45
          ? "text-gda-amber"
          : "text-red-400";

  const stagedDate = item.updated_at
    ? new Date(item.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      })
    : "---";

  return (
    <tr className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9">
      <td className="px-3 py-1.5">
        <button
          type="button"
          onClick={() => onNavigate(item.opportunity_id)}
          className="text-foreground hover:text-gda-green truncate block max-w-xs text-sm text-left"
        >
          {item.opportunity_title}
        </button>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[140px]">
        {item.opportunity_agency ?? "---"}
      </td>
      <td className="px-3 py-1.5">
        {pwin != null ? (
          <span className={cn("font-mono text-xs tabular-nums", pwinClass)}>{pwin}%</span>
        ) : (
          <span className="text-xs text-muted-foreground">---</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
        {item.solicitation_number ?? "---"}
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">
        {stagedDate}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => onPromote(item.opportunity_id)}
            className="rounded border border-gda-green/40 bg-gda-green/10 px-2 py-0.5 text-[11px] font-mono text-gda-green hover:bg-gda-green/20 transition-colors disabled:opacity-50"
          >
            Promote
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onReturn(item.opportunity_id)}
            className="rounded border border-border px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
          >
            Return
          </button>
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
  const { toast: detailToast } = useToast();
  const { data: doctrineEvals } = useDoctrineEvaluations("opportunity", id);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  // F-305: Auto-trigger SSE analysis stream on mount (R2 compliance — no click-to-analyze)
  const analysisStream = useOpportunityAnalysis(id);

  const llmForEffect = opp?.llm_analysis as LlmAnalysis | null | undefined;
  useEffect(() => {
    if (
      opp &&
      !llmForEffect &&
      !analyzeOpp.isPending &&
      !analyzeOpp.data &&
      !analyzeOpp.isError &&
      analyzeOpp.analysisState === "idle"
    ) {
      analyzeOpp.mutate(id);
    }
  }, [id, opp, llmForEffect, analyzeOpp]);

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

  // F-613 BUG 2 guard: verify the returned record matches the requested id
  if (String(opp.id) !== String(id)) {
    return <ErrorState message={`Record mismatch: requested id ${id} but received id ${opp.id}`} />;
  }

  const currentStage = opp.pipeline_stage ? stageKeyToLabel(opp.pipeline_stage) : (opp.stage ?? "Interest");
  const timeline = opp.analysis?.timeline;
  const doctrine = opp.doctrine_badge;
  const doctrineScore = opp.doctrine_score;

  // Doctrine evaluation for hard-block enforcement
  const latestDoctrineEval = doctrineEvals?.[0] ?? null;
  const triggeredExclusions = latestDoctrineEval?.exclusion_triggers.filter((e) => e.triggered) ?? [];
  const isDoctrineBlocked = triggeredExclusions.length > 0;
  const isMarginBlocked = latestDoctrineEval?.margin_check?.passed === false && latestDoctrineEval?.margin_check?.margin_pct != null;

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
          {isSmallBizPlay(opp.naics, opp.set_aside) && (
            <span
              className="rounded border border-gda-green/40 bg-gda-green/10 px-1.5 py-0.5 text-[11px] font-mono font-bold text-gda-green"
              title={sbPlayTooltip(opp.naics, opp.set_aside)}
            >
              SB PLAY
            </span>
          )}
          {opp.data_source && <SourceChip label={opp.data_source} kind="real" />}
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

      {/* ─── F-305: Auto-Analysis Brief (10 sections, SSE-streamed) ── */}
      <AnalysisBrief opportunityId={id} />

      {/* ─── F-313: Generate Briefing PDF ────────────────────────────── */}
      <GenerateBriefingButton opportunityId={id} />

      <Separator className="bg-border" />

      {/* ─── Two-Column Layout ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[55%_1fr]">
        {/* ═══ COLUMN A ═══ */}
        <div className="space-y-4">
          {/* F-305: 10-section Decision Brief via SSE (R2: auto on open, R1: source citations) */}
          <DecisionBriefStream
            sections={analysisStream.sections}
            isStreaming={analysisStream.isStreaming}
            isDone={analysisStream.isDone}
            error={analysisStream.error}
            traceId={analysisStream.traceId}
          />

          {/* Ask AI — inline, always open */}
          <AskAiInline id={id} title={opp.title} agency={opp.agency} pwin={opp.pwin?.score} />

          {/* Capability Match Card (F-306) */}
          <CapabilityMatchCard opportunityId={id} />

          {/* Financial Bible Pricing Scenario (F-311) */}
          <PricingScenarioCard entityId={id} entityKind="opportunity" />

          {/* Margin Floor Banner */}
          {latestDoctrineEval?.margin_check && (
            <MarginFloorBanner
              marginCheck={latestDoctrineEval.margin_check}
              entityId={id}
              entityKind="opportunity"
            />
          )}
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
              {opp.source_uri ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span className="inline-flex items-center gap-2">
                    <a
                      href={opp.source_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-gda-cyan hover:text-gda-green transition-colors truncate max-w-[220px] inline-block"
                    >
                      {opp.sam_notice_id ? `SAM ${opp.sam_notice_id}` : "View Source"} {"\u2197"}
                    </a>
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <FieldStatusBadge reason="no_source_data" />
                </div>
              )}
              {/* Doctrine Fit — demoted to one line */}
              {(doctrine || doctrineScore != null) && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Doctrine Fit</span>
                  <span className="inline-flex items-center gap-1">
                    <span className={cn("font-mono text-foreground", doctrine ? FIT_COLORS[doctrine.label] : "text-gda-cyan")}>
                      {doctrine ? `${doctrine.label} ${Math.round((doctrine.score / 100) * 40)}/40` : `${doctrineScore}/40`}
                    </span>
                    <ScoreExplain
                      score={doctrine ? Math.round((doctrine.score / 100) * 40) : (doctrineScore ?? null)}
                      label="Doctrine Score"
                      scoreType="doctrine_score"
                      inputs={{
                        alignment_total: doctrine ? Math.round((doctrine.score / 100) * 40) : doctrineScore,
                        label: doctrine?.label,
                        matchedPrinciples: doctrine?.matchedPrinciples,
                        rationale: doctrine?.rationale,
                      }}
                    />
                  </span>
                </div>
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

              {/* Doctrine hard-block: disable Qualify when exclusion triggered */}
              {isDoctrineBlocked && (
                <div className="rounded border border-gda-red/30 bg-gda-red/5 px-3 py-2 space-y-1">
                  <p className="text-[11px] font-semibold text-gda-red">
                    Qualify blocked — strategic exclusion triggered
                  </p>
                  {triggeredExclusions.map((excl) => (
                    <p key={excl.id} className="text-[11px] text-muted-foreground">
                      {excl.name}: {excl.evidence.join("; ")}
                    </p>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(true)}
                    className="mt-1 text-[11px] font-mono text-gda-green hover:underline"
                  >
                    Override with rationale
                  </button>
                </div>
              )}

              {isMarginBlocked && !isDoctrineBlocked && (
                <div className="rounded border border-gda-red/30 bg-gda-red/5 px-3 py-2 space-y-1">
                  <p className="text-[11px] font-semibold text-gda-red">
                    Qualify blocked — margin below {latestDoctrineEval?.margin_check.threshold}% floor
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(true)}
                    className="mt-1 text-[11px] font-mono text-gda-green hover:underline"
                  >
                    Override with rationale
                  </button>
                </div>
              )}

              <div className="space-y-1">
                {(STAGE_ACTIONS[currentStage] ?? []).map((action) => {
                  const isQualifyAction = action.stage === "qualify" || action.stage === "qualified";
                  const blocked = isQualifyAction && (isDoctrineBlocked || isMarginBlocked);
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() =>
                        !blocked && action.stage &&
                        updateStage.mutate(
                          { id, stage: action.stage },
                          {
                            onSuccess: () =>
                              detailToast(`Moved to ${action.label}`, "success"),
                            onError: (err) =>
                              detailToast(
                                `Stage change failed: ${err instanceof Error ? err.message : "Unknown error"}`,
                                "error",
                              ),
                          },
                        )
                      }
                      disabled={updateStage.isPending || blocked}
                      title={blocked ? "Blocked by doctrine exclusion or margin floor — override required" : undefined}
                      className={cn(
                        "block w-full text-left rounded border border-border px-3 py-1.5 text-xs font-mono text-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors disabled:opacity-50",
                        blocked && "cursor-not-allowed opacity-40",
                      )}
                    >
                      → {action.label}
                      {blocked && " (blocked)"}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Override Modal */}
          {showOverrideModal && (
            <DoctrineOverrideModal
              entityId={id}
              entityKind="opportunity"
              kind={isDoctrineBlocked ? "exclusion_override" : "margin_override"}
              exclusionIds={triggeredExclusions.map((e) => e.id)}
              onClose={() => setShowOverrideModal(false)}
              onSuccess={() => setShowOverrideModal(false)}
            />
          )}

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

// F-305: DecisionBriefPanel, CompetitiveIntelPanel, RisksPanel removed —
// replaced by DecisionBriefStream (10-section SSE progressive rendering).


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

// F-313: Generate Briefing PDF button
function GenerateBriefingButton({ opportunityId }: { opportunityId: string }) {
  const generate = useGenerateBriefing();
  const { data: docs } = useGeneratedDocuments({ opportunity_id: opportunityId, doc_kind: "briefing" });
  const { toast } = useToast();

  function handleGenerate() {
    generate.mutate(opportunityId, {
      onSuccess: (data) => {
        toast("Briefing PDF generated", "success");
        // Trigger download
        const a = document.createElement("a");
        a.href = `${process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech"}${data.download_url}`;
        a.download = `briefing-${opportunityId}.pdf`;
        a.click();
      },
      onError: (err) => {
        toast(
          `Briefing generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          "error",
        );
      },
    });
  }

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Output Generators
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="block w-full text-left rounded border border-border px-3 py-1.5 text-xs font-mono text-foreground hover:border-gda-cyan/40 hover:text-gda-cyan transition-colors disabled:opacity-50"
        >
          {generate.isPending ? "Generating..." : "Generate Briefing PDF"}
        </button>
        {docs && docs.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Previous Briefings</p>
            {docs.map((doc) => (
              <a
                key={doc.id}
                href={`${process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech"}${doc.download_url}`}
                className="flex items-center justify-between rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs hover:border-gda-cyan/40 transition-colors"
                download
              >
                <span className="font-mono text-foreground">
                  Briefing — {new Date(doc.created_at).toLocaleDateString()}
                </span>
                <span className="text-muted-foreground">
                  {doc.file_size_bytes ? `${Math.round(doc.file_size_bytes / 1024)}KB` : ""}
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
