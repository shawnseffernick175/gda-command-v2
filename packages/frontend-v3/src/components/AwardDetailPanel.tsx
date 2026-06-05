"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceChip } from "@/components/shared/source-chip";
import { formatMoney } from "@/lib/format-money";
import { useAwardAnalyze } from "@/hooks/use-awards";
import type { Award, AwardAnalysis } from "@/lib/types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US");
}

function formatExpires(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

const ACTION_COLORS: Record<string, string> = {
  "Pursue Re-Compete":
    "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  Monitor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  Pass: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
  "Partner with Winner": "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

function buildUSASpendingUrl(fpdsUrl: string | null, awardId: string): string {
  if (fpdsUrl && fpdsUrl.includes("usaspending.gov/award/")) return fpdsUrl;
  return `https://www.usaspending.gov/award/${awardId}/`;
}

export function AwardDetailPanel({
  award,
  onClose,
}: {
  award: Award;
  onClose: () => void;
}) {
  const analyze = useAwardAnalyze();
  const analysis: AwardAnalysis | null =
    award.award_analysis ?? (analyze.data as AwardAnalysis | undefined) ?? null;
  const isAnalyzing = analyze.isPending;

  useEffect(() => {
    if (!award.award_analysis && !analyze.isPending && !analyze.data && !analyze.isError) {
      analyze.mutate(award.id);
    }
  }, [award.id, award.award_analysis, analyze]);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-gda-panel shadow-xl">
      {/* Close button */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          Award Detail
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            {award.recipient_name ?? "Unknown Recipient"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {award.agency ?? "Unknown Agency"}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm text-foreground tabular-nums">
              {formatMoney(award.awarded_amount)}
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              Awarded {formatDate(award.awarded_at)}
            </span>
            {award.period_of_performance_end && (
              <span className="text-[11px] text-muted-foreground font-mono">
                PoP ends {formatDate(award.period_of_performance_end)}
              </span>
            )}
          </div>
        </div>

        {/* Re-Compete Banner */}
        {award.is_recompete_candidate && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
            <span className="text-xs font-bold text-red-400">
              Re-Compete Window Open — Expires{" "}
              {formatExpires(award.period_of_performance_end)}
            </span>
          </div>
        )}

        {/* AI "So What" Section */}
        <div className="space-y-3">
          <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            AI Analysis
          </h3>

          {isAnalyzing && !analysis ? (
            <div className="space-y-2">
              <Skeleton className="h-16 bg-gda-bg-base" />
              <Skeleton className="h-4 w-2/3 bg-gda-bg-base" />
              <Skeleton className="h-4 w-1/2 bg-gda-bg-base" />
              <Skeleton className="h-8 w-40 bg-gda-bg-base" />
            </div>
          ) : analysis ? (
            <div className="space-y-3">
              {/* So What paragraph */}
              <p className="text-xs text-foreground leading-relaxed">
                {analysis.so_what}
              </p>

              {/* Win Rationale */}
              <div className="space-y-0.5">
                <span className="text-[11px] font-mono text-muted-foreground">
                  Win Rationale
                </span>
                <p className="text-xs text-foreground/80">
                  {analysis.win_rationale}
                </p>
              </div>

              {/* Agency Signal */}
              <div className="space-y-0.5">
                <span className="text-[11px] font-mono text-muted-foreground">
                  Agency Signal
                </span>
                <p className="text-xs text-foreground/80">
                  {analysis.agency_signal}
                </p>
              </div>

              {/* Re-Compete Assessment */}
              <div className="space-y-0.5">
                <span className="text-[11px] font-mono text-muted-foreground">
                  Re-Compete Assessment
                </span>
                <p className="text-xs text-foreground/80">
                  {analysis.recompete_assessment}
                </p>
              </div>

              {/* Recommended Action Badge */}
              <div className="pt-1">
                <Badge
                  className={`text-xs font-bold border ${ACTION_COLORS[analysis.recommended_action] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/40"}`}
                >
                  {analysis.recommended_action}
                </Badge>
              </div>
            </div>
          ) : analyze.isError ? (
            <p className="text-xs text-red-400">
              Analysis failed. Try again later.
            </p>
          ) : null}
        </div>

        {/* Sources */}
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Sources
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <SourceChip
              label="USAspending Award"
              url={buildUSASpendingUrl(award.fpds_url, award.id)}
              kind="real"
            />
            {award.fpds_url && (
              <SourceChip
                label="FPDS"
                url={award.fpds_url}
                kind="real"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
