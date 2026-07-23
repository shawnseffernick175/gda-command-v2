"use client";

import { useState, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  useAwardsPaged,
  useAwardsKpis,
  useAwardsCount,
  useAwardPursue,
  useAwardUndismiss,
  type AwardsTab,
} from "@/hooks/use-awards";
import { Pagination } from "@/components/shared/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceChip } from "@/components/shared/source-chip";
import { PendingState } from "@/components/shared/pending-state";
import { ErrorState } from "@/components/shared/error-state";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { Award, AwardsKpis } from "@/lib/types";

const AwardDetailPanel = lazy(() => import("@/components/awards/AwardDetailPanel").then(m => ({ default: m.AwardDetailPanel })));
const DismissDialog = lazy(() => import("@/components/awards/DismissDialog").then(m => ({ default: m.DismissDialog })));

/* ── Tab definitions ──────────────────────────────────────────── */

interface TabDef {
  key: AwardsTab;
  label: string;
  kpiKey?: keyof AwardsKpis;
}

const TAB_DEFS: TabDef[] = [
  { key: "hot", label: "Hot", kpiKey: "hot_recompetes" },
  { key: "90d", label: "Expiring <90d" },
  { key: "1yr", label: "Expiring <1yr" },
  { key: "weak", label: "Weak Incumbents", kpiKey: "weak_incumbents" },
  { key: "vehicles", label: "In My Vehicles", kpiKey: "in_my_vehicles" },
  { key: "pursuing", label: "Already Pursuing", kpiKey: "already_pursuing" },
  { key: "all", label: "All Wheelhouse", kpiKey: "wheelhouse_awards" },
  { key: "excluded", label: "Show Excluded" },
];

/* ── Value range options ──────────────────────────────────────── */

const VALUE_RANGES = [
  { label: "Any Value", min: undefined, max: undefined },
  { label: "$100K–$1M", min: 100_000, max: 1_000_000 },
  { label: "$1M–$10M", min: 1_000_000, max: 10_000_000 },
  { label: "$10M–$100M", min: 10_000_000, max: 100_000_000 },
  { label: ">$100M", min: 100_000_000, max: undefined },
] as const;

/* ── Priority badge helpers ───────────────────────────────────── */

function getPriorityBadge(score: number | null | undefined): { text: string; className: string } {
  if (score === null || score === undefined) return { text: "—", className: "text-muted-foreground" };
  if (score >= 70) return { text: String(score), className: "bg-gda-red/20 text-gda-red border-gda-red/40" };
  if (score >= 50) return { text: String(score), className: "bg-gda-amber/20 text-gda-amber border-gda-amber/40" };
  if (score >= 30) return { text: String(score), className: "bg-gda-cyan/20 text-gda-cyan border-gda-cyan/40" };
  return { text: String(score), className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40" };
}

function getThreatBadge(threatLevel: string | undefined): { label: string; className: string } | null {
  if (!threatLevel) return null;
  const level = threatLevel.toLowerCase();
  if (level === "low") return { label: "Low", className: "text-gda-green" };
  if (level === "medium") return { label: "Medium", className: "text-gda-amber" };
  if (level === "high") return { label: "High", className: "text-gda-red" };
  return null;
}

function formatDaysLeft(days: number | null | undefined): { text: string; className: string } {
  if (days === null || days === undefined) return { text: "—", className: "text-muted-foreground" };
  if (days < 0) return { text: "EXPIRED", className: "text-gda-red font-bold" };
  if (days <= 90) return { text: `${days}d`, className: "text-gda-red font-bold" };
  if (days <= 365) {
    const months = Math.round(days / 30);
    return { text: `${months}mo`, className: "text-gda-amber" };
  }
  return { text: `${Math.round(days / 365)}yr`, className: "text-muted-foreground" };
}

/* ── Main page ────────────────────────────────────────────────── */

export default function AwardsPage() {
  return (
    <Suspense fallback={<div />}>
      <AwardsContent />
    </Suspense>
  );
}

function AwardsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get("page") ?? "1") || 1;

  // State
  const [activeTab, setActiveTab] = useState<AwardsTab>("hot");
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [valueRangeIdx, setValueRangeIdx] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dismissAwardId, setDismissAwardId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { sortParams } = useTableSort();

  const vr = VALUE_RANGES[valueRangeIdx];

  // Data hooks
  const { data: kpis } = useAwardsKpis();
  const { data: countData } = useAwardsCount();
  const { data, isLoading, error, refetch } = useAwardsPaged({
    tab: activeTab,
    search: searchFilter || undefined,
    value_min: vr?.min,
    value_max: vr?.max,
    limit: 50,
    page: currentPage,
    ...sortParams,
  });

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

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

  const handleTabChange = useCallback(
    (tab: AwardsTab) => {
      setActiveTab(tab);
      setPage(1);
    },
    [setPage],
  );

  return (
    <div className="space-y-4" ref={listRef}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        {/* Page title */}
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
            Awards & Intel
          </h1>
          {countData && (
            <span className="shrink-0 text-xs font-mono text-muted-foreground">
              {countData.count.toLocaleString()} wheelhouse awards
            </span>
          )}
          <p className="truncate text-xs text-muted-foreground">
            Contracts already awarded in your wheelhouse — incumbents, expiring contracts, and recompete targets.
          </p>
        </div>

        {/* KPI Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <KpiChip
            label="Hot Recompetes"
            value={kpis?.hot_recompetes}
            onClick={() => handleTabChange("hot")}
            active={activeTab === "hot"}
            colorClass="text-gda-red border-gda-red/30"
          />
          <KpiChip
            label="Wheelhouse Awards"
            value={kpis?.wheelhouse_awards}
            onClick={() => handleTabChange("all")}
            active={activeTab === "all"}
          />
          <KpiChip
            label="Weak Incumbents"
            value={kpis?.weak_incumbents}
            onClick={() => handleTabChange("weak")}
            active={activeTab === "weak"}
            colorClass="text-gda-green border-gda-green/30"
          />
          <KpiChip
            label="In My Vehicles"
            value={kpis?.in_my_vehicles}
            onClick={() => handleTabChange("vehicles")}
            active={activeTab === "vehicles"}
          />
          <KpiChip
            label="Already Pursuing"
            value={kpis?.already_pursuing}
            onClick={() => handleTabChange("pursuing")}
            active={activeTab === "pursuing"}
            colorClass="text-gda-green border-gda-green-muted/30"
          />
        </div>

        {/* Tab filters */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {TAB_DEFS.map((tab) => {
            const count = tab.kpiKey && kpis ? kpis[tab.kpiKey] : null;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 text-xs font-mono transition-colors border-b-2 whitespace-nowrap",
                  activeTab === tab.key
                    ? "border-gda-cyan text-gda-cyan"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}{count !== null ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search awards, incumbents, PIIDs…"
            value={searchInput}
            onChange={handleSearchChange}
            className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-72"
          />
          <select
            value={String(valueRangeIdx)}
            onChange={(e) => {
              setValueRangeIdx(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
          >
            {VALUE_RANGES.map((r, i) => (
              <option key={r.label} value={String(i)}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 bg-gda-panel" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((award) => (
            <AwardCard
              key={award.id}
              award={award}
              onDetail={() => setDetailId(award.id)}
              onDismiss={() => setDismissAwardId(award.id)}
            />
          ))}
        </div>
      ) : (
        !isLoading && (
          <PendingState
            surface="Awards & Intel"
            reason={
              activeTab === "excluded"
                ? "No excluded awards found."
                : "No awards match the current filters. Try adjusting tabs or search."
            }
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

      {/* Detail slide-over */}
      {detailId && (
        <Suspense fallback={null}>
          <AwardDetailPanel
            awardId={detailId}
            onClose={() => setDetailId(null)}
          />
        </Suspense>
      )}

      {/* Dismiss dialog */}
      {dismissAwardId && (
        <Suspense fallback={null}>
          <DismissDialog
            awardId={dismissAwardId}
            onClose={() => setDismissAwardId(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ── KPI chip ─────────────────────────────────────────────────── */

function KpiChip({
  label,
  value,
  onClick,
  active,
  colorClass,
}: {
  label: string;
  value: number | undefined;
  onClick: () => void;
  active?: boolean;
  colorClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded border px-3 py-2 text-left transition-colors cursor-pointer",
        active
          ? "border-gda-cyan bg-gda-cyan/10"
          : "border-border bg-gda-panel hover:bg-gda-cyan/5",
      )}
    >
      <span className={cn(
        "block text-lg font-mono font-bold tabular-nums",
        active ? "text-gda-cyan" : colorClass ? colorClass.split(" ")[0] : "text-foreground",
      )}>
        {value !== undefined ? value.toLocaleString() : "—"}
      </span>
      <span className="block text-[12px] font-mono text-muted-foreground mt-0.5">
        {label}
      </span>
    </button>
  );
}

/* ── Award card (analysis-forward row) ────────────────────────── */

function AwardCard({
  award,
  onDetail,
  onDismiss,
}: {
  award: Award;
  onDetail: () => void;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const pursue = useAwardPursue();
  const undismiss = useAwardUndismiss();

  const priorityBadge = getPriorityBadge(award.priority_score);
  const threat = getThreatBadge(award.award_analysis?.threat_level);
  const daysLeft = formatDaysLeft(award.days_to_pop_end);
  const analysis = award.award_analysis;
  const soWhat = analysis?.so_what;

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

  const heatBorderColor = useMemo(() => {
    if (award.linked_opportunity_id) return "border-l-gda-green";
    if (award.days_to_pop_end !== null && award.days_to_pop_end !== undefined) {
      if (award.days_to_pop_end <= 90) return "border-l-gda-red";
      if (award.days_to_pop_end <= 365) return "border-l-gda-amber";
    }
    return "";
  }, [award.days_to_pop_end, award.linked_opportunity_id]);

  return (
    <div
      className={cn(
        "rounded border border-border bg-gda-panel px-4 py-3 space-y-2 cursor-pointer hover:border-gda-cyan/40 transition-colors",
        heatBorderColor ? `border-l-[3px] ${heatBorderColor}` : "",
      )}
      onClick={onDetail}
    >
      {/* Row 1: Priority badge + title + incumbent + agency */}
      <div className="flex items-start gap-3">
        {/* Priority score badge */}
        <span className={cn(
          "shrink-0 inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-mono font-bold tabular-nums",
          priorityBadge.className,
        )}>
          {priorityBadge.text}
        </span>

        {/* Title + agency */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {award.piid ?? award.recipient_name ?? "Unknown"}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[12px] text-muted-foreground">
              {award.incumbent_name ?? award.recipient_name ?? "Unknown Awardee"}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {award.agency ?? "Unknown Agency"}
              {award.contracting_office ? `, ${award.contracting_office}` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: $, PoP, days, NAICS, contract type */}
      <div className="flex items-center gap-3 flex-wrap text-[12px] font-mono">
        <span className="text-foreground tabular-nums">
          {formatMoney(award.total_value ?? award.awarded_amount)}
        </span>
        <span className="text-muted-foreground">
          {award.contract_type ?? ""}
        </span>
        {award.period_of_performance_end && (
          <span className="text-muted-foreground">
            expires {new Date(award.period_of_performance_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
        <span className={cn("font-bold", daysLeft.className)}>
          ({daysLeft.text})
        </span>
        {award.naics && (
          <span className="text-muted-foreground">
            NAICS {award.naics}
          </span>
        )}
      </div>

      {/* Row 3: Threat + vehicle fit */}
      <div className="flex items-center gap-3 text-[12px]">
        {threat && (
          <span className="font-mono">
            THREAT: <span className={cn("font-bold", threat.className)}>{threat.label}</span>
          </span>
        )}
        {award.award_analysis?.recommended_action && (
          <span className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[12px]",
            award.award_analysis.recommended_action === "Pursue Re-Compete"
              ? "bg-gda-green/10 text-gda-green border-gda-green/30"
              : award.award_analysis.recommended_action === "Monitor"
                ? "bg-gda-amber/10 text-gda-amber border-gda-amber/30"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
          )}>
            {award.award_analysis.recommended_action}
          </span>
        )}
      </div>

      {/* Row 4: So-what analysis (the whole point of the rebuild) */}
      {soWhat && (
        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">
          {soWhat}
        </p>
      )}
      {!soWhat && !analysis && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground italic">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gda-cyan"
            aria-hidden="true"
          />
          Analyzing… (runs automatically; check back shortly)
        </p>
      )}

      {/* Row 5: Actions */}
      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        {!award.linked_opportunity_id ? (
          <button
            onClick={handlePursue}
            disabled={pursue.isPending}
            className="rounded border border-gda-cyan/40 bg-gda-cyan/10 px-2 py-0.5 text-[12px] font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
          >
            {pursue.isPending ? "…" : "+ Add to Capture"}
          </button>
        ) : (
          <button
            onClick={() => router.push(`/opportunities?id=${award.linked_opportunity_id}`)}
            className="text-[12px] font-mono text-gda-green hover:underline"
          >
            Pursuing
          </button>
        )}
        <button
          onClick={onDetail}
          className="text-[12px] font-mono text-gda-cyan hover:underline"
        >
          Detail
        </button>
        {!award.not_interested ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="text-[12px] font-mono text-muted-foreground hover:text-gda-red transition-colors"
          >
            Not Interested
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              undismiss.mutate(award.id);
            }}
            className="text-[12px] font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            Undo Dismiss
          </button>
        )}
        {award.fpds_url && (
          <SourceChip label="USAspending" url={award.fpds_url} kind="real" />
        )}
      </div>
    </div>
  );
}
