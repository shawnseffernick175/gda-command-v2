"use client";

import type { PwinScore, RuleContribution } from "@/lib/types";

export interface PwinBreakdownProps {
  pwin: PwinScore | null | undefined;
}

function DriverList({ drivers }: { drivers: string[] }) {
  return (
    <ul className="space-y-0.5">
      {drivers.map((d, i) => (
        <li key={i} className="ml-3 list-disc text-xs text-foreground">{d}</li>
      ))}
    </ul>
  );
}

function WeightsTable({ weights }: { weights: RuleContribution[] }) {
  const sorted = [...weights].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[12px] text-muted-foreground uppercase tracking-wide">
          <th className="text-left py-1">Rule</th>
          <th className="text-right py-1">Contrib</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((w) => (
          <tr key={w.name} className="border-t border-border">
            <td className="py-1 text-foreground">{w.description}</td>
            <td className="py-1 text-right font-mono tabular-nums text-foreground">
              {w.value >= 0 ? "+" : ""}{w.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PwinBreakdown({ pwin }: PwinBreakdownProps) {
  if (!pwin) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="pwin-empty">
        No PWin data available.
      </div>
    );
  }

  const drivers = pwin.top_drivers ?? [];
  const weights = pwin.feature_weights ?? [];

  return (
    <div className="space-y-3" data-testid="pwin-breakdown">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold text-foreground">
          {pwin.score}%
        </span>
        <span className="text-xs text-muted-foreground">
          {pwin.band} · {pwin.model_version}
        </span>
      </div>

      <div>
        <p className="text-[12px] font-mono text-muted-foreground uppercase tracking-wide mb-1">
          Top Drivers
        </p>
        {drivers.length > 0 ? (
          <DriverList drivers={drivers} />
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="drivers-empty">
            No driver data available.
          </p>
        )}
      </div>

      <div>
        <p className="text-[12px] font-mono text-muted-foreground uppercase tracking-wide mb-1">
          Feature Weights
        </p>
        {weights.length > 0 ? (
          <WeightsTable weights={weights} />
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="weights-empty">
            No feature weight data available.
          </p>
        )}
      </div>
    </div>
  );
}
