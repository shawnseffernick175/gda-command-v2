"use client";

import { useState, useEffect } from "react";
import {
  useCapabilityMatches,
  useComputeCapabilityMatches,
  useQualifyCheck,
  type CapabilityMatch,
  type QualificationResult,
} from "@/hooks/use-capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const OU_LABELS: Record<string, string> = {
  envision: "Envision",
  riverstone: "Riverstone",
  pd_systems: "PD Systems",
};

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-gda-green";
  if (score >= 0.5) return "text-gda-cyan";
  if (score >= 0.3) return "text-gda-amber";
  return "text-gda-red";
}

function scoreBg(score: number): string {
  if (score >= 0.7) return "bg-gda-green";
  if (score >= 0.5) return "bg-gda-cyan";
  if (score >= 0.3) return "bg-gda-amber";
  return "bg-gda-red";
}

export function CapabilityMatchCard({ opportunityId }: { opportunityId: string }) {
  const { data: matches, isLoading } = useCapabilityMatches(opportunityId);
  const computeMatches = useComputeCapabilityMatches();
  const qualifyCheck = useQualifyCheck();
  const [qualification, setQualification] = useState<QualificationResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-compute matches if none exist
  useEffect(() => {
    if (matches && matches.length === 0 && !computeMatches.isPending && !computeMatches.data) {
      computeMatches.mutate(opportunityId);
    }
  }, [matches, opportunityId, computeMatches]);

  // Auto-run qualification check when matches exist
  useEffect(() => {
    if (matches && matches.length > 0 && !qualification && !qualifyCheck.isPending) {
      qualifyCheck.mutate(opportunityId, {
        onSuccess: (result) => setQualification(result),
      });
    }
  }, [matches, opportunityId, qualification, qualifyCheck]);

  const envisionMatches = (matches ?? []).filter((m) => m.capability_ou === "envision");
  const teamingMatches = (matches ?? []).filter((m) => m.capability_ou !== "envision");
  const topMatches = envisionMatches.slice(0, 3);

  if (isLoading || computeMatches.isPending) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Capability Match
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 bg-gda-panel" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Capability Match
          </CardTitle>
          {qualification && (
            <Badge
              variant="outline"
              className={cn(
                "text-[12px] font-mono font-bold border",
                qualification.qualified
                  ? "border-gda-green/40 text-gda-green bg-gda-green/10"
                  : "border-gda-red/40 text-gda-red bg-gda-red/10",
              )}
            >
              {qualification.recommendation === "qualify" ? "QUALIFY" : "DISQUALIFY"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Qualification summary */}
        {qualification && (
          <div
            className={cn(
              "rounded border px-3 py-2 space-y-1",
              qualification.qualified
                ? "border-gda-green/20 bg-gda-green/5"
                : "border-gda-red/20 bg-gda-red/5",
            )}
          >
            {qualification.reasons.map((reason, i) => (
              <p key={i} className="text-[12px] text-muted-foreground leading-relaxed">
                {reason}
              </p>
            ))}
          </div>
        )}

        {/* Top Envision matches */}
        {topMatches.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[12px] font-mono text-muted-foreground uppercase">
              Envision Matches ({envisionMatches.length})
            </p>
            {topMatches.map((match) => (
              <MatchRow
                key={match.capability_id}
                match={match}
                expanded={expandedId === match.capability_id}
                onToggle={() => setExpandedId(expandedId === match.capability_id ? null : match.capability_id)}
              />
            ))}
            {envisionMatches.length > 3 && (
              <p className="text-[12px] text-muted-foreground font-mono">
                + {envisionMatches.length - 3} more
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground font-mono">
            No Envision capability matches found
          </p>
        )}

        {/* Teaming context */}
        {teamingMatches.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-2">
            <p className="text-[12px] font-mono text-muted-foreground uppercase">
              Teaming Context ({teamingMatches.length})
            </p>
            {teamingMatches.slice(0, 3).map((match) => (
              <MatchRow
                key={match.capability_id}
                match={match}
                expanded={expandedId === match.capability_id}
                onToggle={() => setExpandedId(expandedId === match.capability_id ? null : match.capability_id)}
              />
            ))}
          </div>
        )}

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => {
            setQualification(null);
            computeMatches.mutate(opportunityId, {
              onSuccess: () => {
                qualifyCheck.mutate(opportunityId, {
                  onSuccess: (result) => setQualification(result),
                });
              },
            });
          }}
          disabled={computeMatches.isPending}
          className="w-full text-center rounded border border-border px-3 py-1.5 text-[12px] font-mono text-muted-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors disabled:opacity-50"
        >
          Refresh Matches
        </button>
      </CardContent>
    </Card>
  );
}

function MatchRow({
  match,
  expanded,
  onToggle,
}: {
  match: CapabilityMatch;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(match.match_score * 100);
  const qualifies = match.match_score >= 0.5;

  return (
    <div
      className={cn(
        "rounded border border-border bg-gda-bg-deep px-2.5 py-1.5 cursor-pointer transition-colors hover:border-border/80",
        expanded && "ring-1 ring-gda-green/20",
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        {/* Score bar */}
        <div className="w-10 h-1.5 rounded-full bg-border overflow-hidden shrink-0">
          <div
            className={cn("h-full rounded-full", scoreBg(match.match_score))}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("font-mono text-xs font-bold w-8 text-right", scoreColor(match.match_score))}>
          {pct}%
        </span>

        <span className="text-xs text-foreground truncate flex-1">
          {match.capability_name}
        </span>

        <span className="text-[12px] font-mono text-muted-foreground/60 shrink-0">
          {OU_LABELS[match.capability_ou] ?? match.capability_ou}
        </span>

        {match.evidence_grade && (
          <span className={cn(
            "text-[12px] font-mono font-bold shrink-0",
            match.evidence_grade === "A" ? "text-gda-green" : match.evidence_grade === "B" ? "text-gda-cyan" : "text-gda-amber",
          )}>
            {match.evidence_grade}
          </span>
        )}

        {qualifies && match.capability_ou === "envision" && (
          <span className="text-[12px] font-mono text-gda-green shrink-0">
            qualifies
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
          <p className="text-[12px] font-mono text-muted-foreground uppercase">
            {match.capability_category}
          </p>
          {match.match_reasons.map((reason) => (
            <div key={reason.factor} className="flex items-center gap-2 text-[12px]">
              <span className="font-mono text-muted-foreground w-20 shrink-0 capitalize">
                {reason.factor}
              </span>
              <div className="w-12 h-1 rounded-full bg-border overflow-hidden shrink-0">
                <div
                  className={cn("h-full rounded-full", scoreBg(reason.score))}
                  style={{ width: `${Math.round(reason.score * 100)}%` }}
                />
              </div>
              <span className={cn("font-mono w-6 text-right", scoreColor(reason.score))}>
                {Math.round(reason.score * 100)}
              </span>
              <span className="text-muted-foreground truncate">
                {reason.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
