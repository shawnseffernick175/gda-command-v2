"use client";

import { useState, useCallback } from "react";
import {
  useCapabilityMatches,
  useComputeCapabilityMatches,
  useQualifyCheck,
  type CapabilityMatch,
  type QualifyResult,
} from "@/hooks/use-capabilities";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function gradeColor(grade: string | null): string {
  if (grade === "A") return "text-gda-green border-gda-green/40 bg-gda-green/10";
  if (grade === "B") return "text-gda-amber border-gda-amber/40 bg-gda-amber/10";
  if (grade === "C") return "text-gda-red border-gda-red/40 bg-gda-red/10";
  return "text-muted-foreground border-border";
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-gda-green";
  if (score >= 0.5) return "text-gda-amber";
  return "text-gda-red";
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-border">
        <div
          className={cn(
            "h-1.5 rounded-full",
            score >= 0.7 ? "bg-gda-green" : score >= 0.5 ? "bg-gda-amber" : "bg-gda-red",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("font-mono text-[11px]", scoreColor(score))}>
        {pct}%
      </span>
    </div>
  );
}

function MatchRow({ match }: { match: CapabilityMatch }) {
  const [expanded, setExpanded] = useState(false);
  const cap = match.capability;

  return (
    <div className="border-b border-border last:border-b-0 py-2">
      <div
        className="flex items-center justify-between gap-2 cursor-pointer hover:bg-gda-panel/50 rounded px-1 -mx-1"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[13px] font-medium text-foreground">
            {cap?.name ?? match.capability_id}
          </span>
          {cap?.evidence_grade && (
            <Badge
              variant="outline"
              className={cn("text-[11px] font-mono shrink-0", gradeColor(cap.evidence_grade))}
            >
              {cap.evidence_grade}
            </Badge>
          )}
          {cap?.ou && cap.ou !== "envision" && (
            <Badge variant="outline" className="text-[11px] text-muted-foreground shrink-0">
              {cap.ou === "riverstone" ? "RSI" : "PDS"}
            </Badge>
          )}
        </div>
        <ScoreBar score={match.match_score} />
      </div>

      {expanded && (
        <div className="mt-2 ml-1 space-y-1.5">
          {cap && (
            <p className="text-[12px] text-muted-foreground">{cap.description}</p>
          )}
          {match.match_reasons.length > 0 && (
            <div className="space-y-0.5">
              {match.match_reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">{r.factor}:</span>
                  <span className="text-foreground">{r.detail}</span>
                  <span className="font-mono text-muted-foreground">
                    (+{(r.weight * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          )}
          {cap?.certifications && cap.certifications.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {cap.certifications.map((c) => (
                <Badge key={c} variant="outline" className="text-[11px] text-muted-foreground">
                  {c}
                </Badge>
              ))}
            </div>
          )}
          {cap?.past_performance_doc_ids && cap.past_performance_doc_ids.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-[11px] text-muted-foreground cursor-help underline decoration-dotted">
                    {cap.past_performance_doc_ids.length} past performance doc(s)
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {cap.past_performance_doc_ids.map((docId) => (
                      <div key={docId}>{docId}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
}

export function CapabilityMatchCard({
  opportunityId,
  onQualify,
}: {
  opportunityId: string;
  onQualify?: () => void;
}) {
  const { data: matches, isLoading } = useCapabilityMatches(opportunityId);
  const computeMutation = useComputeCapabilityMatches();
  const qualifyMutation = useQualifyCheck();
  const { toast } = useToast();
  const [qualifyResult, setQualifyResult] = useState<QualifyResult | null>(null);

  const top3 = matches?.slice(0, 3) ?? [];
  const hasQualifying = top3.some(
    (m) => m.capability?.ou === "envision" && m.match_score >= 0.5,
  );

  const handleCompute = useCallback(() => {
    computeMutation.mutate(opportunityId, {
      onSuccess: () => {
        toast("Capability matches recomputed", "success");
      },
      onError: () => {
        toast("Failed to compute matches", "error");
      },
    });
  }, [computeMutation, opportunityId, toast]);

  const handleQualifyCheck = useCallback(() => {
    qualifyMutation.mutate(opportunityId, {
      onSuccess: (result) => {
        setQualifyResult(result);
        if (result.qualified && onQualify) {
          onQualify();
        }
      },
      onError: () => {
        toast("Qualification check failed", "error");
      },
    });
  }, [qualifyMutation, opportunityId, toast, onQualify]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Capability Matches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse rounded bg-gda-panel" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Capability Matches</CardTitle>
          <button
            onClick={handleCompute}
            disabled={computeMutation.isPending}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-gda-panel hover:text-foreground disabled:opacity-50"
          >
            {computeMutation.isPending ? "Computing..." : "Recompute"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {top3.length === 0 ? (
          <div className="py-4 text-center text-[13px] text-muted-foreground">
            No capability matches found. Click &ldquo;Recompute&rdquo; to analyze.
          </div>
        ) : (
          <div className="space-y-0">
            {top3.map((m) => (
              <MatchRow key={m.capability_id} match={m} />
            ))}
            {(matches?.length ?? 0) > 3 && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                +{(matches?.length ?? 0) - 3} more matches
              </p>
            )}
          </div>
        )}

        <div className="mt-3 border-t border-border pt-3">
          {qualifyResult ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] font-mono",
                    qualifyResult.qualified
                      ? "text-gda-green border-gda-green/40 bg-gda-green/10"
                      : "text-gda-red border-gda-red/40 bg-gda-red/10",
                  )}
                >
                  {qualifyResult.qualified ? "QUALIFIES" : "DOES NOT QUALIFY"}
                </Badge>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {qualifyResult.reason}
              </p>
              {qualifyResult.doctrine_exclusions.length > 0 && (
                <div className="text-[11px] text-gda-red">
                  Doctrine exclusions: {qualifyResult.doctrine_exclusions.join(", ")}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleQualifyCheck}
              disabled={qualifyMutation.isPending || !hasQualifying}
              title={
                !hasQualifying
                  ? "No Envision capability scores >= 0.5"
                  : undefined
              }
              className={cn(
                "w-full rounded border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50",
                hasQualifying
                  ? "border-gda-green/40 bg-gda-green/10 text-gda-green hover:bg-gda-green/20"
                  : "border-border bg-white text-muted-foreground cursor-not-allowed",
              )}
            >
              {qualifyMutation.isPending
                ? "Checking..."
                : "Qualify into pipeline"}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
