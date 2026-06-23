"use client";

import { useEffect } from "react";
import { useOodaAnalysis } from "@/hooks/use-llm";
import { Skeleton } from "@/components/ui/skeleton";

const OODA_PHASES = ["Observe", "Orient", "Decide", "Act"] as const;

export function OodaInspector({
  opportunityId,
  stage,
  context,
}: {
  opportunityId: string;
  stage?: string;
  context?: Record<string, unknown>;
}) {
  const ooda = useOodaAnalysis();

  useEffect(() => {
    if (!ooda.data && !ooda.isPending && !ooda.error) {
      ooda.mutate({ opportunity_id: opportunityId, stage, context });
    }
  }, [opportunityId, stage, context, ooda]);

  if (ooda.isPending) {
    return (
      <div className="space-y-3">
        {OODA_PHASES.map((phase) => (
          <div key={phase}>
            <h4 className="font-mono text-xs font-medium text-muted-foreground mb-2">
              {phase}
            </h4>
            <Skeleton className="h-16 bg-gda-bg-base" />
          </div>
        ))}
      </div>
    );
  }

  if (ooda.error) {
    const isTimeout = ooda.error.name === "AbortError";
    return (
      <div className="rounded border border-gda-amber/30 bg-gda-amber/10 p-3 text-xs">
        <p className="text-gda-amber italic">
          {isTimeout
            ? "Analysis timed out"
            : "OODA analysis unavailable"}
        </p>
      </div>
    );
  }

  const output = ooda.data?.output as Record<string, unknown> | null;

  if (!ooda.data?.ok || !output) {
    return (
      <div className="rounded border border-border bg-gda-bg-base p-3 text-xs text-muted-foreground italic">
        OODA analysis returned no data.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {OODA_PHASES.map((phase) => {
        const phaseKey = phase.toLowerCase();
        const content = output[phaseKey];
        return (
          <div key={phase}>
            <h4 className="font-mono text-xs font-medium text-foreground">
              {phase}
            </h4>
            <div className="mt-1 rounded border border-border bg-gda-bg-base p-2 text-xs text-muted-foreground">
              {content ? (
                <p className="whitespace-pre-wrap">{String(content)}</p>
              ) : (
                <p className="italic">Pending analysis for this phase</p>
              )}
            </div>
          </div>
        );
      })}
      {ooda.data.model_used && (
        <p className="text-[11px] text-muted-foreground">
          Model: {ooda.data.model_used} · {ooda.data.latency_ms}ms
        </p>
      )}
    </div>
  );
}
