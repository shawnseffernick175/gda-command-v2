"use client";

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

  /* Idle state — user has not triggered analysis yet */
  if (!ooda.data && !ooda.isPending && !ooda.error) {
    return (
      <div className="rounded border border-border bg-gda-bg-base p-4 text-center">
        <p className="text-xs text-muted-foreground mb-3">
          OODA loop analysis maps this opportunity across Observe → Orient → Decide → Act
        </p>
        <button
          type="button"
          onClick={() => ooda.mutate({ opportunity_id: opportunityId, stage, context })}
          className="rounded border border-gda-cyan/30 px-3 py-1.5 text-xs font-mono text-gda-cyan hover:bg-gda-cyan/10 transition-colors"
        >
          Run OODA Analysis
        </button>
      </div>
    );
  }

  /* Loading skeletons */
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

  /* Error state */
  if (ooda.error) {
    return (
      <div className="rounded border border-gda-amber/30 bg-gda-amber/10 p-3 text-xs text-gda-amber italic">
        OODA analysis failed — try again later.
      </div>
    );
  }

  const output = ooda.data?.output as Record<string, unknown> | null;

  if (!ooda.data?.ok || !output) {
    return (
      <div className="rounded border border-border bg-gda-bg-base p-3 text-xs text-muted-foreground italic">
        OODA analysis returned no data. Try re-running.
      </div>
    );
  }

  /* Result state — show 4-phase output with re-run button */
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => ooda.mutate({ opportunity_id: opportunityId, stage, context })}
          className="rounded border border-gda-cyan/30 px-2 py-1 text-[11px] font-mono text-gda-cyan hover:bg-gda-cyan/10 transition-colors"
        >
          Re-run
        </button>
      </div>
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
