"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBadge } from "@/components/shared/EvidenceBadge";
import {
  useDoctrineEvaluations,
  useDoctrineCheck,
  type DoctrineEvaluation,
  type PrincipleScore,
  type ExclusionResult,
} from "@/hooks/use-doctrine-evaluation";
import { Skeleton } from "@/components/ui/skeleton";

function AlignmentLabel({ total }: { total: number }) {
  if (total >= 32) return <span className="text-gda-green font-bold">Strong alignment</span>;
  if (total >= 24) return <span className="text-gda-amber font-bold">Moderate alignment</span>;
  if (total >= 16) return <span className="text-foreground font-bold">Weak alignment</span>;
  return <span className="text-gda-red font-bold">Poor alignment</span>;
}

function PrincipleRow({
  id,
  score,
  isMustWin,
}: {
  id: string;
  score: PrincipleScore;
  isMustWin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const barWidth = `${(score.score / 5) * 100}%`;
  const barColor =
    score.score >= 4
      ? "bg-gda-green"
      : score.score >= 3
        ? "bg-gda-amber"
        : "bg-gda-red";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left hover:bg-gda-panel/30 rounded px-1 py-0.5 transition-colors"
      >
        <span className="w-36 truncate text-xs text-foreground capitalize">
          {id.replace(/_/g, " ")}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: barWidth }} />
        </div>
        <span className="w-8 text-right font-mono text-xs text-foreground tabular-nums">
          {score.score}/5
        </span>
        <EvidenceBadge grade={score.evidence_grade} showWarning={isMustWin} />
        <span className={cn("text-[12px] text-muted-foreground transition-transform", expanded && "rotate-180")}>
          v
        </span>
      </button>
      {expanded && (
        <div className="ml-2 pl-3 border-l border-border space-y-1 pb-1">
          <p className="text-[12px] text-muted-foreground leading-relaxed">{score.rationale}</p>
          {score.citations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {score.citations.map((c, i) => (
                <span
                  key={i}
                  className="inline-block rounded border border-border bg-gda-panel px-1.5 py-0.5 text-[12px] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExclusionRow({ result }: { result: ExclusionResult }) {
  if (!result.triggered) return null;
  return (
    <div className="rounded border border-gda-red/30 bg-gda-red/5 px-3 py-2 space-y-1">
      <p className="text-xs font-semibold text-gda-red">
        BLOCKED: {result.name}
      </p>
      {result.evidence.map((e, i) => (
        <p key={i} className="text-[12px] text-muted-foreground">{e}</p>
      ))}
      {result.override_available && (
        <p className="text-[12px] text-muted-foreground italic">
          Override available with executive rationale (min 50 chars)
        </p>
      )}
    </div>
  );
}

function EvaluationContent({ evaluation }: { evaluation: DoctrineEvaluation }) {
  const triggeredExclusions = evaluation.exclusion_triggers.filter((e) => e.triggered);
  const lowestPrinciple = Object.entries(evaluation.principle_scores).sort(
    (a, b) => a[1].score - b[1].score,
  )[0];

  return (
    <div className="space-y-3">
      {/* Total score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-foreground tabular-nums">
            {evaluation.alignment_total}/40
          </span>
          <AlignmentLabel total={evaluation.alignment_total} />
        </div>
        <span className="text-[12px] text-muted-foreground">
          {new Date(evaluation.evaluated_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Lowest principle highlight */}
      {lowestPrinciple && lowestPrinciple[1].score <= 2 && (
        <div className="rounded border border-gda-amber/40 bg-gda-amber/5 px-3 py-2">
          <p className="text-[12px] text-gda-amber font-medium">
            Lowest: {lowestPrinciple[0].replace(/_/g, " ")} ({lowestPrinciple[1].score}/5)
          </p>
          <p className="text-[12px] text-muted-foreground">{lowestPrinciple[1].rationale}</p>
        </div>
      )}

      {/* Exclusion alerts */}
      {triggeredExclusions.length > 0 && (
        <div className="space-y-2">
          {triggeredExclusions.map((excl) => (
            <ExclusionRow key={excl.id} result={excl} />
          ))}
        </div>
      )}

      {/* Margin check */}
      {!evaluation.margin_check.passed && evaluation.margin_check.margin_pct != null && (
        <div className="rounded border border-gda-red/30 bg-gda-red/5 px-3 py-2">
          <p className="text-xs font-semibold text-gda-red">
            Margin floor violation: {evaluation.margin_check.margin_pct}% {"<"} {evaluation.margin_check.threshold}% minimum
          </p>
          <p className="text-[12px] text-muted-foreground">
            Source: {evaluation.margin_check.source} | Override requires executive rationale
          </p>
        </div>
      )}

      {/* All 8 principles */}
      <div className="space-y-1">
        {Object.entries(evaluation.principle_scores)
          .sort((a, b) => b[1].score - a[1].score)
          .map(([id, score]) => (
            <PrincipleRow key={id} id={id} score={score} isMustWin={false} />
          ))}
      </div>

      {/* Recommendations */}
      {evaluation.recommendations.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border">
          <p className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
            Recommendations
          </p>
          <ul className="space-y-1">
            {evaluation.recommendations.map((rec, i) => (
              <li key={i} className="text-[12px] text-muted-foreground leading-relaxed">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DoctrineAlignmentPanel({ entityId }: { entityId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: evaluations, isLoading } = useDoctrineEvaluations("opportunity", entityId);
  const runCheck = useDoctrineCheck();
  const autoTriggered = useRef(false);

  const latestEval = evaluations?.[0] ?? null;

  // R2: Auto-trigger doctrine check when page opens and no evaluation exists.
  // Silent and background — no manual button.
  useEffect(() => {
    if (
      !isLoading &&
      !latestEval &&
      !runCheck.isPending &&
      !runCheck.data &&
      !autoTriggered.current
    ) {
      autoTriggered.current = true;
      runCheck.mutate({ entity_kind: "opportunity", entity_id: entityId });
    }
  }, [isLoading, latestEval, runCheck, entityId]);

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left w-full"
        >
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Doctrine Alignment
          </CardTitle>
          {latestEval && (
            <span className="font-mono text-xs text-foreground tabular-nums">
              {latestEval.alignment_total}/40
            </span>
          )}
          {runCheck.isPending && (
            <span className="text-[12px] text-muted-foreground italic">analyzing...</span>
          )}
          <span className={cn("ml-auto text-xs text-muted-foreground transition-transform", collapsed && "-rotate-90")}>
            v
          </span>
        </button>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0">
          {isLoading || runCheck.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-32 bg-gda-bg-base" />
              <Skeleton className="h-20 bg-gda-bg-base" />
            </div>
          ) : latestEval ? (
            <EvaluationContent evaluation={latestEval} />
          ) : (
            <div className="py-4">
              <p className="text-xs text-muted-foreground">
                Doctrine evaluation pending.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
