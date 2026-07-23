"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceChip } from "@/components/shared/source-chip";
import { formatMoney } from "@/lib/format-money";
import { useAwardDetail, useAwardAnalyze, useAwardPursue } from "@/hooks/use-awards";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getThreatColor(level: string | undefined): string {
  if (!level) return "text-muted-foreground";
  const l = level.toLowerCase();
  if (l === "low") return "text-gda-green";
  if (l === "medium") return "text-gda-amber";
  if (l === "high") return "text-gda-red";
  return "text-muted-foreground";
}

function getPriorityColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  if (score >= 70) return "text-gda-red";
  if (score >= 50) return "text-gda-amber";
  if (score >= 30) return "text-gda-cyan";
  return "text-zinc-400";
}

export function AwardDetailPanel({
  awardId,
  onClose,
}: {
  awardId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: award, isLoading } = useAwardDetail(awardId);
  const analyze = useAwardAnalyze();
  const pursue = useAwardPursue();

  const analysis = award?.award_analysis ?? (analyze.data ?? null);

  useEffect(() => {
    if (award && !award.award_analysis && !analyze.isPending && !analyze.data && !analyze.isError) {
      analyze.mutate(awardId);
    }
  }, [awardId, award, analyze]);

  const handlePursue = useCallback(() => {
    pursue.mutate(awardId, {
      onSuccess: (data) => {
        router.push(`/opportunities?id=${data.opportunity_id}`);
      },
    });
  }, [awardId, pursue, router]);

  const usaspendingUrl = award?.fpds_url?.includes("usaspending.gov/award/")
    ? award.fpds_url
    : `https://www.usaspending.gov/award/${awardId}/`;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-gda-panel shadow-xl">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
          Award Detail
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="12" y2="12" />
            <line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3 bg-gda-bg-base" />
            <Skeleton className="h-4 w-1/2 bg-gda-bg-base" />
            <Skeleton className="h-20 bg-gda-bg-base" />
          </div>
        ) : award ? (
          <>
            {/* ── 1. Header ───────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex items-center justify-center rounded border px-2.5 py-1 text-sm font-mono font-bold tabular-nums",
                  getPriorityColor(award.priority_score),
                  "border-current/30",
                )}>
                  {award.priority_score ?? "—"}
                </span>
                <h2 className="text-sm font-semibold text-foreground">
                  {award.piid ?? award.recipient_name ?? "Unknown"}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {award.incumbent_name ?? award.recipient_name ?? "Unknown Awardee"}
              </p>
              <p className="text-xs text-muted-foreground">
                {award.agency ?? "Unknown Agency"}
                {award.contracting_office ? ` — ${award.contracting_office}` : ""}
              </p>
              <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
                <span className="text-foreground tabular-nums">
                  {formatMoney(award.total_value ?? award.awarded_amount)}
                </span>
                <span className="text-muted-foreground">
                  {award.contract_type}
                </span>
                {award.period_of_performance_end && (
                  <span className="text-muted-foreground">
                    PoP ends {formatDate(award.period_of_performance_end)}
                    {award.days_to_pop_end !== null && award.days_to_pop_end !== undefined && (
                      <span className={cn(
                        "ml-1 font-bold",
                        award.days_to_pop_end <= 90 ? "text-gda-red"
                          : award.days_to_pop_end <= 365 ? "text-gda-amber"
                            : "text-muted-foreground",
                      )}>
                        ({award.days_to_pop_end}d)
                      </span>
                    )}
                  </span>
                )}
                {award.naics && (
                  <span className="text-muted-foreground">NAICS {award.naics}</span>
                )}
                {award.set_aside && (
                  <span className="text-muted-foreground">{award.set_aside}</span>
                )}
              </div>
            </div>

            {/* ── 2. AI Analysis Panel ─────────────────────────── */}
            <div className="space-y-4 rounded border border-border bg-gda-bg-base p-4">
              <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                AI Analysis
              </h3>

              {analyze.isPending && !analysis ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 bg-gda-panel" />
                  <Skeleton className="h-4 w-2/3 bg-gda-panel" />
                </div>
              ) : analysis ? (
                <div className="space-y-3">
                  {/* So What */}
                  <div className="space-y-1">
                    <span className="text-[12px] font-mono text-muted-foreground uppercase">So What</span>
                    <p className="text-xs text-foreground leading-relaxed">{analysis.so_what}</p>
                  </div>

                  {/* Threat Level */}
                  {analysis.threat_level && (
                    <div className="space-y-1">
                      <span className="text-[12px] font-mono text-muted-foreground uppercase">Threat Level</span>
                      <p className={cn("text-xs font-bold", getThreatColor(analysis.threat_level))}>
                        {analysis.threat_level}
                      </p>
                    </div>
                  )}

                  {/* Win Rationale */}
                  {analysis.win_rationale && (
                    <div className="space-y-1">
                      <span className="text-[12px] font-mono text-muted-foreground uppercase">Win Rationale</span>
                      <p className="text-xs text-foreground/80">{analysis.win_rationale}</p>
                    </div>
                  )}

                  {/* Recompete Assessment */}
                  {analysis.recompete_assessment && (
                    <div className="space-y-1">
                      <span className="text-[12px] font-mono text-muted-foreground uppercase">Recompete Assessment</span>
                      <p className="text-xs text-foreground/80">{analysis.recompete_assessment}</p>
                    </div>
                  )}

                  {/* Envision Angle */}
                  {analysis.envision_angle && (
                    <div className="space-y-1">
                      <span className="text-[12px] font-mono text-muted-foreground uppercase">Envision Angle</span>
                      <p className="text-xs text-foreground/80">{analysis.envision_angle}</p>
                    </div>
                  )}

                  {/* Agency Signal */}
                  {analysis.agency_signal && (
                    <div className="space-y-1">
                      <span className="text-[12px] font-mono text-muted-foreground uppercase">Agency Signal</span>
                      <p className="text-xs text-foreground/80">{analysis.agency_signal}</p>
                    </div>
                  )}

                  {/* Recommended Action */}
                  {analysis.recommended_action && (
                    <div className="pt-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[12px] font-mono font-bold",
                          analysis.recommended_action === "Pursue Re-Compete"
                            ? "bg-gda-green/10 text-gda-green border-gda-green/40"
                            : analysis.recommended_action === "Monitor"
                              ? "bg-gda-amber/10 text-gda-amber border-gda-amber/40"
                              : analysis.recommended_action === "Pass"
                                ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/40"
                                : "bg-gda-cyan/10 text-gda-cyan border-gda-cyan/40",
                        )}
                      >
                        {analysis.recommended_action}
                      </Badge>
                    </div>
                  )}
                </div>
              ) : analyze.isError ? (
                <p className="text-xs text-gda-red">Analysis failed. Try again later.</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">No analysis available</p>
              )}
            </div>

            {/* ── 3. Vehicle Fit ───────────────────────────────── */}
            {award.vehicle_fit && award.vehicle_fit.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Vehicle Fit
                </h3>
                <div className="flex flex-wrap gap-2">
                  {award.vehicle_fit.map((v) => (
                    <span
                      key={v.short_name}
                      className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-2 py-0.5 text-[12px] font-mono text-gda-cyan"
                    >
                      {v.short_name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── 4. Sources ──────────────────────────────────── */}
            <div className="space-y-2">
              <h3 className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sources
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <SourceChip
                  label="USAspending Award"
                  url={usaspendingUrl}
                  kind="real"
                />
                {award.fpds_url && (
                  <SourceChip label="FPDS" url={award.fpds_url} kind="real" />
                )}
              </div>
            </div>

            {/* ── 5. Action Bar ────────────────────────────────── */}
            <div className="flex items-center gap-3 border-t border-border pt-4">
              {!award.linked_opportunity_id ? (
                <button
                  onClick={handlePursue}
                  disabled={pursue.isPending}
                  className="rounded border border-gda-cyan/40 bg-gda-cyan/10 px-3 py-1.5 text-xs font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
                >
                  {pursue.isPending ? "Creating…" : "+ Add to Capture"}
                </button>
              ) : (
                <button
                  onClick={() => router.push(`/opportunities?id=${award.linked_opportunity_id}`)}
                  className="rounded border border-gda-green/40 bg-gda-green/10 px-3 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 transition-colors"
                >
                  View Pursuit
                </button>
              )}
              <a
                href={usaspendingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-mono text-gda-cyan hover:underline"
              >
                View on USAspending
              </a>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Award not found.</p>
        )}
      </div>
    </div>
  );
}
