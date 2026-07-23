"use client";

import type {
  ColorTeamDoctrineScore,
  ColorTeamMarginCheck,
  ColorTeamPricingStrategy,
} from "@/lib/types";

interface DoctrineScorecardPanelProps {
  doctrineScores: ColorTeamDoctrineScore[];
  marginCheck: ColorTeamMarginCheck | null;
  exclusionHits: string[] | null;
  pricingStrategy: ColorTeamPricingStrategy | null;
}

export function DoctrineScorecardPanel({
  doctrineScores,
  marginCheck,
  exclusionHits,
  pricingStrategy,
}: DoctrineScorecardPanelProps) {
  return (
    <div className="space-y-3">
      {/* Doctrine Alignment Scorecard */}
      {doctrineScores.length > 0 && (
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
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {ds.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      )}

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
              <span className="text-[12px] text-muted-foreground">
                Projected
              </span>
              <p className="font-mono text-lg text-foreground">
                {marginCheck.projected_margin}%
              </p>
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground">Floor</span>
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

      {/* Pricing Strategy */}
      {pricingStrategy && (
        <div className="rounded border border-border bg-gda-panel p-4">
          <h4 className="mb-3 text-sm font-semibold text-gda-green">
            Pricing Strategy
            {pricingStrategy.status === "unavailable" && (
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                (inputs incomplete)
              </span>
            )}
          </h4>
          {pricingStrategy.sourced_facts.length > 0 && (
            <div className="mb-3 space-y-1">
              {pricingStrategy.sourced_facts.map((f) => (
                <div
                  key={`${f.label}-${f.source}`}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-foreground">{f.label}</span>
                  <span className="font-mono text-foreground">{f.value}</span>
                  <span
                    className="max-w-[45%] truncate text-[12px] text-muted-foreground"
                    title={f.source}
                  >
                    {f.source}
                  </span>
                </div>
              ))}
            </div>
          )}
          {pricingStrategy.recommendations.length > 0 && (
            <div className="mb-2">
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Recommendations
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground">
                {pricingStrategy.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {pricingStrategy.missing_inputs.length > 0 && (
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Inputs required
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gda-amber">
                {pricingStrategy.missing_inputs.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
