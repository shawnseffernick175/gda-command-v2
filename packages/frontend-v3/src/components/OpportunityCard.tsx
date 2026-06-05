"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BandBadge } from "@/components/band-badge";
import { SourceChip } from "@/components/shared/source-chip";
import { StageDropdown } from "@/components/shared/stage-dropdown";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { OpportunitySummary, DoctrineFitLabel } from "@/lib/types";

const FIT_COLORS: Record<DoctrineFitLabel, string> = {
  strong: "text-gda-green",
  moderate: "text-gda-cyan",
  weak: "text-gda-amber",
  none: "text-muted-foreground",
};

function PwinDisplay({ score }: { score: number }) {
  const color =
    score > 60
      ? "text-gda-green"
      : score >= 40
        ? "text-gda-amber"
        : "text-red-400";
  return (
    <span className={cn("font-mono text-2xl font-bold", color)}>
      {Math.round(score)}
    </span>
  );
}

function AnalyzingSkeleton() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground animate-pulse">
      Analyzing…
    </span>
  );
}

function daysRemaining(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function buildSamUrl(opp: OpportunitySummary): string | null {
  if (opp.source?.toLowerCase().includes("sam")) {
    const extended = opp as OpportunitySummary & { notice_id?: string; sam_notice_id?: string };
    const noticeId = extended.notice_id ?? extended.sam_notice_id;
    if (noticeId) {
      return `https://sam.gov/opp/${noticeId}/view`;
    }
  }
  return null;
}

export function OpportunityCard({ opp }: { opp: OpportunitySummary }) {
  const hasPwin = opp.pwin != null;
  const hasDoctrine = opp.doctrine_badge != null || opp.doctrine_score != null;
  const days = opp.due_date ? daysRemaining(opp.due_date) : null;
  const samUrl = buildSamUrl(opp);
  const deadlineWarning = opp.deadline_warning === true;

  return (
    <div className="relative rounded border border-border bg-gda-panel p-4 space-y-3 flex flex-col">
      {/* Deadline warning badge */}
      {deadlineWarning && (
        <span className="absolute top-2 right-2 rounded bg-red-500/15 border border-red-500/40 px-1.5 py-0.5 text-[11px] font-mono font-bold uppercase text-red-400">
          DEADLINE
        </span>
      )}

      {/* Top zone */}
      <div className="space-y-1 pr-16">
        <Link
          href={`/opportunities?id=${opp.id}`}
          className="text-sm font-semibold text-foreground hover:text-gda-green leading-snug line-clamp-2"
        >
          {opp.title}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          {opp.agency && (
            <Badge variant="outline" className="text-[11px]">
              {opp.agency}
            </Badge>
          )}
          {opp.set_aside && (
            <Badge
              variant="outline"
              className="text-[11px] border-gda-amber/30 text-gda-amber"
            >
              {opp.set_aside}
            </Badge>
          )}
        </div>
      </div>

      {/* Middle zone — scores */}
      <div className="flex items-center gap-4">
        {hasPwin ? (
          <div className="flex items-center gap-2">
            <PwinDisplay score={opp.pwin!.score} />
            <BandBadge band={opp.pwin!.band} className="text-[11px]" />
          </div>
        ) : (
          <AnalyzingSkeleton />
        )}

        {hasDoctrine ? (
          opp.doctrine_badge ? (
            <span
              className={cn(
                "text-[11px] font-mono capitalize",
                FIT_COLORS[opp.doctrine_badge.label],
              )}
            >
              {opp.doctrine_badge.label}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-gda-cyan">
              {opp.doctrine_score}pt
            </span>
          )
        ) : (
          <AnalyzingSkeleton />
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center gap-3 mt-auto pt-1 border-t border-border/50 text-[11px]">
        {opp.value != null && (
          <span className="font-mono text-foreground">
            {formatMoney(opp.value)}
          </span>
        )}
        {days != null && (
          <span className={cn("font-mono", days < 30 ? "text-red-400" : "text-muted-foreground")}>
            {days}d left
          </span>
        )}
        {opp.source ? (
          <SourceChip
            label={opp.source.toLowerCase().includes("sam") ? "SAM.gov" : opp.source}
            url={samUrl}
            kind="real"
          />
        ) : null}
      </div>

      {/* Right edge — Stage dropdown */}
      <div className="absolute top-12 right-3">
        <StageDropdown value={opp.stage ?? "Interest"} className="text-[11px]" />
      </div>
    </div>
  );
}
