"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { ScoreExplain } from "@/components/shared/score-explainers";
import { Pagination } from "@/components/shared/Pagination";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { stageKeyToLabel } from "@/lib/stages";
import {
  usePipelineSummary,
  usePipelineList,
  type PipelineListItem,
  type PipelineStageStats,
} from "@/hooks/use-pipeline";
import { useUpdateStage } from "@/hooks/use-opportunities";
import { useToast } from "@/components/ui/toast";
import { PipelineCoverageCard } from "./PipelineCoverageCard";

const PAGE_SIZE = 50;

/* ── Stage config ──────────────────────────────────────────────── */

const PIPELINE_BUCKETS = [
  { label: "Interest", dbKey: "interest" },
  { label: "Pursue", dbKey: "pursue" },
  { label: "Solicitation", dbKey: "solicitation" },
  { label: "Submission", dbKey: "post_submittal" },
  { label: "Won", dbKey: "won" },
] as const;

const STAGE_BAR_COLORS: Record<string, string> = {
  Interest: "bg-muted-foreground/40",
  Qualify: "bg-foreground/30",
  Pursue: "bg-gda-cyan/60",
  Solicitation: "bg-gda-cyan/60",
  Submission: "bg-gda-cyan/80",
  Won: "bg-gda-green",
};

const STAGE_BADGE_COLORS: Record<string, string> = {
  interest: "border-muted text-muted-foreground",
  qualify: "border-foreground/40 text-foreground",
  pursue: "border-gda-cyan text-gda-cyan",
  solicitation: "border-gda-cyan text-gda-cyan",
  post_submittal: "border-gda-cyan/80 text-gda-cyan",
  won: "bg-gda-green/20 text-gda-green border-transparent",
};

const STAGE_ARROW_COLORS: Record<string, string> = {
  Interest: "bg-muted text-muted-foreground",
  Qualify: "bg-foreground/10 text-foreground",
  Pursue: "bg-gda-cyan/20 text-gda-cyan",
  Solicitation: "bg-gda-cyan/20 text-gda-cyan",
  Submission: "bg-gda-cyan/20 text-gda-cyan",
  Won: "bg-gda-green/20 text-gda-green",
};

/* ── Display label for pipeline stage db key ───────────────────── */

function pipelineStageLabel(dbKey: string): string {
  if (dbKey === "post_submittal") return "Submission";
  return stageKeyToLabel(dbKey);
}

/* ── Urgency helpers ───────────────────────────────────────────── */

function formatDaysLeft(dueAt: string | null): { text: string; className: string } {
  if (!dueAt) return { text: "—", className: "text-muted-foreground" };
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 864e5);
  if (days < 0) return { text: "PAST DUE", className: "text-gda-red font-mono font-bold italic" };
  if (days <= 7) return { text: `${days}d`, className: "text-gda-red font-mono font-bold" };
  if (days <= 30) return { text: `${days}d`, className: "text-gda-amber font-mono" };
  return {
    text: new Date(dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    className: "text-muted-foreground",
  };
}

/* ── CSV Export ─────────────────────────────────────────────────── */

const Q = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;  
function exportCsv(items: PipelineListItem[]) {
  const h = "Title,Agency,Stage,Value,Weighted,Pwin,Due,Sol#";
  const rows = items.map((it) => {
    return [Q(it.opportunity_title), Q(it.opportunity_agency), Q(pipelineStageLabel(it.stage)),
      it.resolved_value, it.resolved_weighted, it.resolved_pwin ?? 0, it.opportunity_due_at ?? "", Q(it.solicitation_number)].join(",");
  });
  const blob = new Blob([[h, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `pipeline-${new Date().toISOString().slice(0, 10)}.csv` }).click();
  URL.revokeObjectURL(url);
}

/* ── Main page ─────────────────────────────────────────────────── */

const PIPELINE_SORT_COLS: ColumnSortConfig[] = [
  { field: "title", type: "string", accessor: (r) => (r.opportunity_title as string) ?? "" },
  { field: "stage", type: "enum", enumOrder: ["Interest", "Pursue", "Solicitation", "Submission", "Won"], accessor: (r) => stageKeyToLabel(r.stage as string) },
  { field: "value", type: "number", accessor: (r) => (r.resolved_value as number) ?? 0 },
  { field: "weighted", type: "number", accessor: (r) => (r.resolved_weighted as number) ?? 0 },
  { field: "pwin", type: "number", accessor: (r) => (r.resolved_pwin as number) ?? null },
  { field: "due", type: "date", accessor: (r) => (r.opportunity_due_at as string) ?? null },
];

export default function PipelinePage() {
  return (
    <Suspense fallback={<div />}>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState("");
  const [moversOpen, setMoversOpen] = useState(true);
  const { sortBy, sortDir, handleSort } = useTableSort();

  // Persist stage filter + page in URL so sort survives filter changes
  const activeBucket = searchParams.get("stage_filter") || null;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const setActiveBucket = useCallback(
    (bucket: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (bucket) {
        params.set("stage_filter", bucket);
      } else {
        params.delete("stage_filter");
      }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const setPage = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (p <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(p));
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const { data: summary, isLoading: summaryLoading } = usePipelineSummary();

  const {
    data: qualifyData,
    isLoading: qualifyLoading,
  } = usePipelineList({ stage: "qualify", limit: 200 });
  const qualifyItems = qualifyData?.items ?? [];
  const updateStage = useUpdateStage();
  const { toast } = useToast();

  const dbStage = activeBucket
    ? PIPELINE_BUCKETS.find((b) => b.label === activeBucket)?.dbKey
    : undefined;

  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    refetch,
  } = usePipelineList({
    q: search || undefined,
    stage: dbStage,
    limit: 200,
  });

  const items = useMemo(() => {
    const raw = (listData?.items ?? []).filter(
      (item) => item.stage !== "no_bid",
    );
    if (sortBy) {
      return sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, PIPELINE_SORT_COLS) as unknown as typeof raw;
    }
    return [...raw].sort((a, b) => (b.resolved_pwin ?? 0) - (a.resolved_pwin ?? 0));
  }, [listData, sortBy, sortDir]);

  const filterKey = `${search}|${activeBucket ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    if (page !== 1) setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pagedItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  const maxStageCount = useMemo(() => {
    if (!summary) return 1;
    return Math.max(
      ...PIPELINE_BUCKETS.map((b) => {
        const stats = summary.by_stage[pipelineStageLabel(b.dbKey)] ?? summary.by_stage[stageKeyToLabel(b.dbKey)];
        return stats?.count ?? 0;
      }),
      1,
    );
  }, [summary]);

  const handleBucketClick = useCallback(
    (label: string) => {
      setActiveBucket(activeBucket === label ? null : label);
    },
    [activeBucket, setActiveBucket],
  );

  const isLoading = summaryLoading || listLoading;

  return (
    <div className="space-y-4">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">Pipeline</h1>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your active pursuits grouped by capture stage, from early interest
              through submission and win. Track how opportunities move through the
              funnel, see stage-by-stage value and conversion, and spot where
              deals are stalling.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(items)}
            className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs font-mono text-foreground hover:bg-gda-bg-base transition-colors"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── Section 0: Shipley Pipeline Coverage Card ─────────── */}
      <PipelineCoverageCard />

      {/* ── Section 1: Pipeline KPI Strip ─────────────────────────── */}
      {summaryLoading ? (
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 flex-1 bg-gda-panel" />
          ))}
        </div>
      ) : summary ? (
        <div className="flex flex-wrap gap-2">
          <IntelChip
            label={formatMoney(summary.total_pipeline_value)}
            sub="Total Pipeline"
            onClick={() => setActiveBucket(null)}
          />
          <span className="inline-flex items-center gap-1">
            <IntelChip
              label={formatMoney(summary.weighted_pipeline_value)}
              sub="Weighted Pipeline"
            />
            <ScoreExplain
              score={formatMoney(summary.weighted_pipeline_value)}
              label="Pipeline Value (Weighted)"
              scoreType="pipeline_value"
            />
          </span>
          <IntelChip
            label={String(summary.active_pursuits)}
            sub="Active Pursuits"
            onClick={() => setActiveBucket(null)}
          />
          <IntelChip
            label={String(summary.proposals_out)}
            sub="Proposals Out"
            onClick={() => handleBucketClick("Submission")}
          />
          <IntelChip
            label={formatMoney(summary.won_ytd)}
            sub="Won YTD"
            onClick={() => handleBucketClick("Won")}
          />
        </div>
      ) : null}

      {/* ── Section 2: Stage Buckets (6) ──────────────────────────── */}
      {summaryLoading ? (
        <Skeleton className="h-24 bg-gda-panel" />
      ) : summary ? (
        <div className="grid grid-cols-5 gap-2">
          {PIPELINE_BUCKETS.map((bucket) => {
            const displayLabel = pipelineStageLabel(bucket.dbKey);
            const stats: PipelineStageStats =
              summary.by_stage[displayLabel] ??
              summary.by_stage[stageKeyToLabel(bucket.dbKey)] ??
              { count: 0, value: 0, weighted_value: 0 };
            const barPct = maxStageCount > 0 ? (stats.count / maxStageCount) * 100 : 0;
            const isActive = activeBucket === bucket.label;
            return (
              <button
                key={bucket.dbKey}
                type="button"
                onClick={() => handleBucketClick(bucket.label)}
                className={cn(
                  "rounded border border-border bg-gda-panel p-3 text-left transition-colors hover:bg-gda-bg-base",
                  isActive && "border-b-2 border-b-gda-green",
                )}
              >
                <div className="font-mono text-xs uppercase text-muted-foreground">{bucket.label}</div>
                <div className="font-mono text-sm font-bold text-foreground">{stats.count} opps</div>
                <div className="font-mono text-xs text-gda-green">{formatMoney(stats.value)}</div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gda-bg-base overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", STAGE_BAR_COLORS[bucket.label])}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ── Section 3: Stage Movers ───────────────────────────────── */}
      {summary && summary.stage_movers.length > 0 && (
        <div className="rounded border border-border bg-gda-panel overflow-hidden">
          <button
            type="button"
            onClick={() => setMoversOpen((p) => !p)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <span className="font-mono text-xs font-bold uppercase text-muted-foreground">
              Stage Movers — Last 7 Days
            </span>
            <span className="text-xs text-muted-foreground">{moversOpen ? "▾" : "▸"}</span>
          </button>
          {moversOpen && (
            <div className="border-t border-border">
              {summary.stage_movers.map((mover, idx) => (
                <Link
                  key={`${mover.internal_id}-${idx}`}
                  href={`/opportunities?id=${mover.internal_id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gda-bg-base transition-colors border-b border-border last:border-b-0"
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-mono shrink-0",
                      STAGE_ARROW_COLORS[mover.to_stage_label] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {mover.from_stage_label
                      ? `${mover.from_stage_label} → ${mover.to_stage_label}`
                      : `→ ${mover.to_stage_label}`}
                  </span>
                  <span className="text-foreground truncate">{mover.title}</span>
                  {mover.value != null && (
                    <span className="font-mono text-xs text-gda-green shrink-0">
                      {formatMoney(mover.value)}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
                    {new Date(mover.moved_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {summary && summary.stage_movers.length === 0 && (
        <div className="rounded border border-border bg-gda-panel px-3 py-4 text-center">
          <span className="font-mono text-xs text-muted-foreground">
            No stage changes in the last 7 days
          </span>
        </div>
      )}

      {/* ── Qualify Staging Section ─────────────────────────────── */}
      {qualifyLoading ? (
        <Skeleton className="h-16 bg-gda-panel" />
      ) : qualifyItems.length > 0 ? (
        <div className="rounded border border-border bg-gda-panel overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="font-mono text-xs font-bold uppercase text-muted-foreground">
              Qualify — Staging (Not Counted)
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {qualifyItems.length} opp{qualifyItems.length !== 1 ? "s" : ""}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Title</th>
                <th className="px-3 py-1.5 text-left font-medium w-[120px]">Agency</th>
                <th className="px-3 py-1.5 text-left font-medium w-[60px]">Pwin</th>
                <th className="px-3 py-1.5 text-left font-medium w-[80px]">Source</th>
                <th className="px-3 py-1.5 text-left font-medium w-[90px]">Qualified</th>
                <th className="px-3 py-1.5 text-left font-medium w-[180px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {qualifyItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-gda-bg-base/50 transition-colors h-9">
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/opportunities?id=${item.opportunity_id}`}
                      className="text-foreground hover:text-gda-green truncate block max-w-xs"
                    >
                      {item.opportunity_title}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
                    {item.opportunity_agency ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-foreground">
                    {item.resolved_pwin != null && item.resolved_pwin > 0
                      ? `${Math.round(item.resolved_pwin)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {item.solicitation_number ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                    {new Date(item.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={updateStage.isPending}
                        onClick={() =>
                          updateStage.mutate(
                            { id: item.opportunity_id, stage: "forecast" },
                            {
                              onSuccess: () => toast("Promoted to Pipeline", "success"),
                              onError: (err) => toast(`Failed: ${err.message}`, "error"),
                            },
                          )
                        }
                        className="rounded border border-gda-green px-2 py-0.5 text-[11px] font-mono text-gda-green hover:bg-gda-green/10 transition-colors"
                      >
                        Promote to Pipeline
                      </button>
                      <button
                        type="button"
                        disabled={updateStage.isPending}
                        onClick={() =>
                          updateStage.mutate(
                            { id: item.opportunity_id, stage: "signal" },
                            {
                              onSuccess: () => toast("Returned to Ops Tracker", "success"),
                              onError: (err) => toast(`Failed: ${err.message}`, "error"),
                            },
                          )
                        }
                        className="rounded border border-border px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-gda-bg-base transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── Section 4: Search bar ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pipeline..."
          className="w-full rounded border border-border bg-gda-bg-base px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
        />
        {activeBucket && (
          <button
            type="button"
            onClick={() => setActiveBucket(null)}
            className="shrink-0 rounded border border-border bg-gda-panel px-2.5 py-1 text-xs font-mono text-foreground"
          >
            {activeBucket} x
          </button>
        )}
      </div>

      {/* ── Section 5: Pipeline List ──────────────────────────────── */}
      {listError && (
        <ErrorState
          message={(listError as Error).message}
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
                <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Stage" field="stage" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="90px" />
                <SortableHeader label="Value" field="value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                <SortableHeader label="Weighted" field="weighted" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                <SortableHeader label="Pwin" field="pwin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                <SortableHeader label="Due" field="due" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="70px" />
                <th className="px-3 py-2 text-left font-medium w-[40px] bg-gda-bg-base">→</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => (
                <PipelineRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No items match filters.
            </div>
          )}
          {items.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
              <span className="text-xs text-muted-foreground font-mono">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, items.length)} of {items.length}
              </span>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── IntelChip ─────────────────────────────────────────────────── */

function IntelChip({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="bg-gda-panel border border-border rounded px-3 py-1.5 text-left"
    >
      <div className="font-mono text-sm font-bold text-foreground">{label}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{sub}</div>
    </Tag>
  );
}

/* ── PipelineRow ──────────────────────────────────────────────── */

function PipelineRow({ item }: { item: PipelineListItem }) {
  const resolvedValue = item.resolved_value;
  const resolvedPwin = item.resolved_pwin;
  const resolvedWeighted = item.resolved_weighted;
  const daysLeft = formatDaysLeft(item.opportunity_due_at);
  const stageLabel = pipelineStageLabel(item.stage);

  return (
    <tr className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9">
      <td className="px-3 py-1.5">
        <div>
          <Link
            href={`/opportunities?id=${item.opportunity_id}`}
            className="text-foreground hover:text-gda-green truncate block max-w-xs"
          >
            {item.opportunity_title}
          </Link>
          {item.opportunity_agency && (
            <span className="text-[11px] text-muted-foreground truncate block max-w-xs">
              {item.opportunity_agency}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-left">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[11px] font-mono",
            STAGE_BADGE_COLORS[item.stage] ?? "border-border text-muted-foreground",
          )}
        >
          {stageLabel}
        </span>
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-foreground tabular-nums">
        {formatMoney(resolvedValue)}
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-gda-green tabular-nums">
        {formatMoney(resolvedWeighted)}
      </td>
      <td className="px-3 py-1.5 text-left">
        {resolvedPwin != null && resolvedPwin > 0 ? (
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-foreground">{Math.round(resolvedPwin)}%</span>
            {item.pwin_band && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[10px] font-mono uppercase",
                  item.pwin_band === "high" && "bg-gda-green/20 text-gda-green",
                  item.pwin_band === "medium" && "bg-gda-amber/20 text-gda-amber",
                  item.pwin_band === "low" && "bg-gda-red/10 text-gda-red",
                )}
              >
                {item.pwin_band}
              </span>
            )}
            <ScoreExplain
              score={Math.round(resolvedPwin)}
              label="Pwin"
              scoreType="pwin"
              inputs={{ top_drivers: [] }}
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-left">
        <span className={cn("text-xs tabular-nums", daysLeft.className)}>{daysLeft.text}</span>
      </td>
      <td className="px-3 py-1.5 text-left">
        <Link
          href={`/opportunities?id=${item.opportunity_id}`}
          className="text-xs text-muted-foreground hover:text-gda-green"
        >
          →
        </Link>
      </td>
    </tr>
  );
}
