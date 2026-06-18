"use client";

import type { CaptureDetail, CapturePlan } from "@/lib/types";

interface OverviewTabProps {
  capture: CaptureDetail;
  plan: CapturePlan | null;
}

export function OverviewTab({ capture, plan }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Pursuit metadata */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">Pursuit</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[11px] text-muted-foreground">Program</span>
            <p className="text-sm text-foreground">{capture.title}</p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">Stage</span>
            <p className="text-sm text-foreground">{capture.stage}</p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">Value</span>
            <p className="text-sm font-mono text-foreground">
              {capture.value != null
                ? capture.value === 1 ? "IDIQ" : `$${capture.value.toLocaleString()}`
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">Pwin</span>
            <p className="text-sm font-mono text-foreground">
              {plan?.computed_pwin != null
                ? `${Math.round(plan.computed_pwin * 100)}%`
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Forecastability */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">Forecast Status</h3>
        {plan?.is_forecastable ? (
          <span className="inline-flex items-center rounded bg-gda-green/10 px-2 py-0.5 text-xs text-gda-green">
            Forecastable
          </span>
        ) : (
          <div>
            <span className="inline-flex items-center rounded bg-gda-amber/10 px-2 py-0.5 text-xs text-gda-amber">
              Unforecastable
            </span>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Score all 3 required drivers (Customer, Solution, Competitive) to enable forecasting.
            </p>
          </div>
        )}
      </div>

      {/* Driver summary */}
      {plan && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">Driver Scores</h3>
          <div className="grid grid-cols-3 gap-3">
            <DriverScoreCard label="Customer" score={plan.customer_relationship_score} />
            <DriverScoreCard label="Solution" score={plan.solution_fit_score} />
            <DriverScoreCard label="Competitive" score={plan.competitive_position_score} />
          </div>
        </div>
      )}
    </div>
  );
}

function DriverScoreCard({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="rounded border border-border bg-gda-panel px-3 py-2 text-center">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <p className="text-lg font-mono font-bold text-foreground">
        {score != null ? `${score}/5` : "—"}
      </p>
    </div>
  );
}
