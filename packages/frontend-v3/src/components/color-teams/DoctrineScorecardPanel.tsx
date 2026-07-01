"use client";

import type { ColorTeamDoctrineScore, ColorTeamMarginCheck } from "@/lib/types";

interface DoctrineScorecardPanelProps {
  doctrineScores: ColorTeamDoctrineScore[];
  marginCheck: ColorTeamMarginCheck | null;
  exclusionHits: string[] | null;
}

export function DoctrineScorecardPanel({
  doctrineScores,
  marginCheck,
  exclusionHits,
}: DoctrineScorecardPanelProps) {
  return (
    <div className="space-y-3">
      {/* Doctrine Alignment Scorecard */}
      <div className="rounded border border-border bg-gda-panel p-4">
        <h4 className="mb-3 text-sm font-semibold text-gda-green">
          Doctrine Alignment Scorecard
        </h4>
        <div className="space-y-1.5">
          {doctrineScores.map((ds) => {
            const pct = Math.min(100, Math.max(0, ds.score));
            const barColor =
              pct >= 80
                ? "bg-gda-green"
                : pct >= 60
                  ? "bg-gda-amber"
                  : "bg-gda-red";
            return (
              <div key={ds.principle}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{ds.principle}</span>
                  <span className="font-mono text-muted-foreground">
                    {ds.score}/100
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 w-full rounded-full bg-gda-bg-deep">
                  <div
                    className={`h-1.5 rounded-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {ds.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Margin Gauge */}
      {marginCheck && (
        <div
          className={`rounded border p-3 ${
            marginCheck.pass
              ? "border-gda-green/30 bg-gda-green/5"
              : "border-gda-red/30 bg-gda-red/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Margin Check
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                marginCheck.pass
                  ? "bg-gda-green/20 text-gda-green"
                  : "bg-gda-red/20 text-gda-red"
              }`}
            >
              {marginCheck.pass ? "PASS" : "FAIL"}
            </span>
          </div>
          <div className="mt-2 flex items-end gap-4">
            <div>
              <span className="text-[11px] text-muted-foreground">
                Projected
              </span>
              <p className="font-mono text-lg text-foreground">
                {marginCheck.projected_margin}%
              </p>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground">Floor</span>
              <p className="font-mono text-lg text-muted-foreground">
                {marginCheck.floor}%
              </p>
            </div>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-gda-bg-deep">
            <div
              className={`h-2 rounded-full ${marginCheck.pass ? "bg-gda-green" : "bg-gda-red"}`}
              style={{
                width: `${Math.min(100, (marginCheck.projected_margin / Math.max(marginCheck.floor, 1)) * 50)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Exclusion Banner */}
      {exclusionHits && exclusionHits.length > 0 && (
        <div className="rounded border border-gda-red/40 bg-gda-red/10 p-3">
          <p className="text-sm font-semibold text-gda-red">
            Exclusion Hits Detected
          </p>
          <p className="mt-1 text-xs text-gda-red/80">
            {exclusionHits.join(", ")} {"\u2014"} Executive override required
          </p>
        </div>
      )}
    </div>
  );
}
