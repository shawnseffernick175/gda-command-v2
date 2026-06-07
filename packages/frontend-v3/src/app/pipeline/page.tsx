"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useOpportunitiesPaged } from "@/hooks/use-opportunities";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { Pagination } from "@/components/shared/Pagination";
import { formatMoney } from "@/lib/format-money";
import { apiGet } from "@/lib/api";
import type { OpportunitySummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/* ── Types ──────────────────────────────────────────────────────── */

interface StageStats {
  count: number;
  value: number;
}

interface StageMover {
  internal_id: string;
  title: string;
  agency: string | null;
  value: number | null;
  stage: string;
  stage_label: string;
  moved_at: string;
}

interface PipelineSummary {
  total_pipeline_value: number;
  weighted_pipeline_value: number;
  active_pursuits: number;
  proposals_out: number;
  moved_this_week: number;
  by_stage: Record<string, StageStats>;
  stage_movers: StageMover[];
}

/* ── Stage config ──────────────────────────────────────────────── */

const FUNNEL_STAGES = ["Interest", "Qualified", "Capture", "Proposal", "Won"] as const;

const STAGE_BAR_COLORS: Record<string, string> = {
  Interest: "bg-muted-foreground/40",
  Qualified: "bg-gda-cyan/40",
  Capture: "bg-gda-amber/40",
  Proposal: "bg-gda-green/40",
  Won: "bg-gda-green",
};

const STAGE_BADGE_COLORS: Record<string, string> = {
  Interest: "border-muted text-muted-foreground",
  Qualified: "border-gda-cyan text-gda-cyan",
  Capture: "border-gda-amber text-gda-amber",
  Proposal: "border-gda-green text-gda-green",
  Won: "bg-gda-green/20 text-gda-green border-transparent",
};

const STAGE_ARROW_COLORS: Record<string, string> = {
  Interest: "bg-muted text-muted-foreground",
  Qualified: "bg-gda-cyan/20 text-gda-cyan",
  Capture: "bg-gda-amber/20 text-gda-amber",
  Proposal: "bg-gda-green/20 text-gda-green",
  Evaluation: "bg-gda-amber/20 text-gda-amber",
  Won: "bg-gda-green/20 text-gda-green",
};

/* ── Pipeline stage filter mapping ─────────────────────────────── */

const STAGE_TO_DB: Record<string, string> = {
  Interest: "qualifying",
  Qualified: "pursuit",
  Capture: "proposal",
  Proposal: "submitted",
  Won: "won",
};

/* ── Urgency helpers ───────────────────────────────────────────── */

function getDaysLeft(opp: OpportunitySummary): number | null {
  const dd = opp.response_due_at ?? opp.due_date ?? null;
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
  const d = new Date((opp.response_due_at ?? opp.due_date)!);
  return {
    text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    className: "text-muted-foreground",
  };
}

/* ── CSV Export ─────────────────────────────────────────────────── */

function exportCsv(items: OpportunitySummary[]) {
  const header = ["Title", "Agency", "Stage", "Value", "Weighted Value", "Pwin Score", "Due Date", "Solicitation Number"];
  const rows = items.map((opp) => {
    const value = opp.value_max ?? opp.value_min ?? opp.value ?? 0;
    const pwinScore = opp.pwin?.score ?? 0;
    const weighted = Math.round(value * (pwinScore / 100));
    const dueDate = opp.response_due_at ?? opp.due_date ?? "";
    return [
      `"${(opp.title ?? "").replace(/"/g, '""')}"`,
      `"${(opp.agency ?? "").replace(/"/g, '""')}"`,
      `"${opp.pipeline_stage ?? ""}"`,
      String(value),
      String(weighted),
      String(pwinScore),
      dueDate,
      `"${(opp.solicitation_number ?? "").replace(/"/g, '""')}"`,
    ].join(",");
  });
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pipeline-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Hook ──────────────────────────────────────────────────────── */

function usePipelineSummary() {
  return useQuery({
    queryKey: ["pipeline-summary"],
    queryFn: () => apiGet<PipelineSummary>("/v3/pipeline/summary"),
  });
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function PipelinePage() {
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [moversOpen, setMoversOpen] = useState(true);
  const [page, setPage] = useState(1);

  const { data: summary, isLoading: summaryLoading } = usePipelineSummary();

  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    refetch,
  } = useOpportunitiesPaged({
    q: search || undefined,
    stage: activeStage ? STAGE_TO_DB[activeStage] : undefined,
    limit: 200,
  });

  const items = useMemo(() => {
    const raw = listData?.items ?? [];
    return [...raw].sort((a, b) => (b.pwin?.score ?? 0) - (a.pwin?.score ?? 0));
  }, [listData]);

  // Reset to first page when the active filter changes. Adjust state during
  // render (React's supported pattern) rather than in an effect.
  const filterKey = `${search}|${activeStage ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pagedItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  const maxStageCount = useMemo(() => {
    if (!summary) return 1;
    return Math.max(
      ...FUNNEL_STAGES.map((s) => summary.by_stage[s]?.count ?? 0),
      1,
    );
  }, [summary]);

  const handleStageClick = useCallback(
    (stage: string) => {
      setActiveStage((prev) => (prev === stage ? null : stage));
    },
    [],
  );

  const isLoading = summaryLoading || listLoading;

  return (
    <div className="space-y-4">
      {/* ── Header row ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-foreground">Pipeline</h1>
        <button
          type="button"
          onClick={() => exportCsv(items)}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs font-mono text-foreground hover:bg-gda-bg-base transition-colors"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* ── Section 1: Intelligence Bar ───────────────────────────── */}
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
            onClick={() => setActiveStage(null)}
          />
          <IntelChip
            label={formatMoney(summary.weighted_pipeline_value)}
            sub="Weighted"
          />
          <IntelChip
            label={String(summary.active_pursuits)}
            sub="Active Pursuits"
            onClick={() => setActiveStage(null)}
          />
          <IntelChip
            label={String(summary.proposals_out)}
            sub="Proposals Out"
            onClick={() => handleStageClick("Proposal")}
          />
          <IntelChip
            label={String(summary.moved_this_week)}
            sub="Moved This Week"
            onClick={() => setMoversOpen((p) => !p)}
          />
        </div>
      ) : null}

      {/* ── Section 2: Stage Funnel ───────────────────────────────── */}
      {summaryLoading ? (
        <Skeleton className="h-24 bg-gda-panel" />
      ) : summary ? (
        <div className="grid grid-cols-5 gap-2">
          {FUNNEL_STAGES.map((stage) => {
            const stats = summary.by_stage[stage] ?? { count: 0, value: 0 };
            const barPct = maxStageCount > 0 ? (stats.count / maxStageCount) * 100 : 0;
            const isActive = activeStage === stage;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => handleStageClick(stage)}
                className={cn(
                  "rounded border border-border bg-gda-panel p-3 text-left transition-colors hover:bg-gda-bg-base",
                  isActive && "border-b-2 border-b-gda-green",
                )}
              >
                <div className="font-mono text-xs uppercase text-muted-foreground">{stage}</div>
                <div className="font-mono text-sm font-bold text-foreground">{stats.count} opps</div>
                <div className="font-mono text-xs text-gda-green">{formatMoney(stats.value)}</div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gda-bg-base overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", STAGE_BAR_COLORS[stage])}
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
              {summary.stage_movers.map((mover) => (
                <Link
                  key={mover.internal_id}
                  href={`/opportunities?id=${mover.internal_id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gda-bg-base transition-colors border-b border-border last:border-b-0"
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-mono shrink-0",
                      STAGE_ARROW_COLORS[mover.stage_label] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    → {mover.stage_label}
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

      {/* ── Section 4: Search bar ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pipeline..."
          className="w-full rounded border border-border bg-gda-bg-base px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
        />
        {activeStage && (
          <button
            type="button"
            onClick={() => setActiveStage(null)}
            className="shrink-0 rounded border border-border bg-gda-panel px-2.5 py-1 text-xs font-mono text-foreground"
          >
            {activeStage} x
          </button>
        )}
      </div>

      {/* ── Section 4: Pipeline List ──────────────────────────────── */}
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
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium w-[90px]">Stage</th>
                <th className="px-3 py-2 text-left font-medium w-[100px]">Value</th>
                <th className="px-3 py-2 text-left font-medium w-[100px]">Weighted</th>
                <th className="px-3 py-2 text-left font-medium w-[80px]">Pwin</th>
                <th className="px-3 py-2 text-left font-medium w-[70px]">Due</th>
                <th className="px-3 py-2 text-left font-medium w-[40px]">→</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((opp) => (
                <PipelineRow key={opp.internal_id ?? opp.id} opp={opp} />
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No opportunities match the current filters.
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

/* ── Stage display mapping ────────────────────────────────────── */

const STAGE_DISPLAY: Record<string, string> = {
  qualifying: "Interest",
  pursuit: "Qualified",
  proposal: "Capture",
  submitted: "Proposal",
  evaluation: "Evaluation",
  won: "Won",
  lost: "Lost",
  no_bid: "No-Bid",
};

/* ── PipelineRow ──────────────────────────────────────────────── */

function PipelineRow({ opp }: { opp: OpportunitySummary }) {
  const pwin = opp.pwin;
  const rawValue = opp.value_max ?? opp.value_min ?? opp.value ?? 0;
  const pwinScore = pwin?.score ?? 0;
  const weightedValue = Math.round(rawValue * (pwinScore / 100));
  const daysLeft = formatDaysLeft(opp);
  const pipelineStage = opp.pipeline_stage;
  const stageLabel = pipelineStage ? (STAGE_DISPLAY[pipelineStage] ?? pipelineStage) : null;

  return (
    <tr className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9">
      <td className="px-3 py-1.5">
        <div>
          <Link
            href={`/opportunities?id=${opp.internal_id}`}
            className="text-foreground hover:text-gda-green truncate block max-w-xs"
          >
            {opp.title}
          </Link>
          {opp.agency && (
            <span className="text-[11px] text-muted-foreground truncate block max-w-xs">
              {opp.agency}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-left">
        {stageLabel ? (
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[11px] font-mono",
              STAGE_BADGE_COLORS[stageLabel] ?? "border-border text-muted-foreground",
            )}
          >
            {stageLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-foreground tabular-nums">
        {formatMoney(rawValue)}
      </td>
      <td className="px-3 py-1.5 text-left font-mono text-xs text-gda-green tabular-nums">
        {formatMoney(weightedValue)}
      </td>
      <td className="px-3 py-1.5 text-left">
        {pwin ? (
          <div className="flex items-center gap-1">
            <ScoreDisplay score={pwin.score} className="text-xs" />
            <BandBadge band={pwin.band} />
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
          href={`/opportunities?id=${opp.internal_id}`}
          className="text-xs text-muted-foreground hover:text-gda-green"
        >
          →
        </Link>
      </td>
    </tr>
  );
}
