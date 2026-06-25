"use client";

import type { ProjectFullRow } from "@/lib/types";
import { cn } from "@/lib/utils";

function safeMargin(profit: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return (profit / revenue) * 100;
}

function ArcGauge({ value, max }: { value: number; max: number }) {
  const r = 60;
  const cx = 70;
  const cy = 70;
  const startAngle = 220;
  const endAngle = -40;
  const totalAngle = startAngle - endAngle;

  const pct = Math.min(Math.max(value / max, 0), 1);
  const sweepAngle = totalAngle * pct;

  function polarToCart(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }

  const bgStart = polarToCart(startAngle);
  const bgEnd = polarToCart(endAngle);
  const valEnd = polarToCart(startAngle - sweepAngle);

  const bgLargeArc = totalAngle > 180 ? 1 : 0;
  const valLargeArc = sweepAngle > 180 ? 1 : 0;

  return (
    <svg viewBox="0 0 140 100" className="mx-auto w-48">
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${bgLargeArc} 0 ${bgEnd.x} ${bgEnd.y}`}
        fill="none"
        className="stroke-fin-sand"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {pct > 0 && (
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${valLargeArc} 0 ${valEnd.x} ${valEnd.y}`}
          fill="none"
          className="stroke-fin-teal"
          strokeWidth="10"
          strokeLinecap="round"
        />
      )}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-fin-ink text-lg font-semibold"
        fontSize="20"
        fontWeight="600"
      >
        {value.toFixed(1)}%
      </text>
    </svg>
  );
}

export function ProfitMarginCard({ project }: { project: ProjectFullRow }) {
  const periodMargin = safeMargin(
    project.actual_period_profit,
    project.actual_period_revenue,
  );
  const ytdMargin = safeMargin(
    project.actual_ytd_profit,
    project.actual_ytd_revenue,
  );
  const targetPeriodMargin = safeMargin(
    project.target_period_profit,
    project.target_period_revenue,
  );
  const targetYtdMargin = safeMargin(
    project.target_ytd_profit,
    project.target_ytd_revenue,
  );

  const hasData = periodMargin != null || ytdMargin != null;

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No margin data for this period yet</p>
      </div>
    );
  }

  const gaugeValue = periodMargin ?? ytdMargin ?? 0;
  const gaugeMax = Math.max(gaugeValue * 1.5, 50);

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-fin-ink">Profit Margin</h3>
      <ArcGauge value={gaugeValue} max={gaugeMax} />
      <div className="mt-2 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Period</p>
          <p className="text-lg font-semibold text-foreground">
            {periodMargin != null ? `${periodMargin.toFixed(1)}%` : "\u2014"}
          </p>
          {targetPeriodMargin != null && (
            <p
              className={cn(
                "text-[11px]",
                periodMargin != null && periodMargin >= targetPeriodMargin
                  ? "text-gda-green"
                  : "text-gda-red",
              )}
            >
              Target: {targetPeriodMargin.toFixed(1)}%
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">YTD</p>
          <p className="text-lg font-semibold text-foreground">
            {ytdMargin != null ? `${ytdMargin.toFixed(1)}%` : "\u2014"}
          </p>
          {targetYtdMargin != null && (
            <p
              className={cn(
                "text-[11px]",
                ytdMargin != null && ytdMargin >= targetYtdMargin
                  ? "text-gda-green"
                  : "text-gda-red",
              )}
            >
              Target: {targetYtdMargin.toFixed(1)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
