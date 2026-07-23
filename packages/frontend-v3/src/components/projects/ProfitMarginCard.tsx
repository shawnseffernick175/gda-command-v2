"use client";

import type { ProjectFullRow } from "@/lib/types";
import { cn } from "@/lib/utils";

function safeMargin(profit: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return (profit / revenue) * 100;
}

function ArcGauge({
  value,
  target,
  label,
}: {
  value: number;
  target: number | null;
  label: string;
}) {
  const r = 52;
  const cx = 60;
  const cy = 60;
  const strokeW = 8;
  const startAngle = 220;
  const endAngle = -40;
  const totalAngle = startAngle - endAngle;
  const maxPct = Math.max(Math.abs(value) * 1.5, 50);
  const pct = Math.min(Math.max(value / maxPct, 0), 1);
  const sweepAngle = totalAngle * pct;

  const targetPct =
    target != null ? Math.min(Math.max(target / maxPct, 0), 1) : null;

  function polarToCart(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }

  const bgStart = polarToCart(startAngle);
  const bgEnd = polarToCart(endAngle);
  const valEnd = polarToCart(startAngle - sweepAngle);

  const bgLargeArc = totalAngle > 180 ? 1 : 0;
  const valLargeArc = sweepAngle > 180 ? 1 : 0;

  const targetAngle =
    targetPct != null ? startAngle - totalAngle * targetPct : null;
  const targetPos = targetAngle != null ? polarToCart(targetAngle) : null;

  const atOrAbove = target != null && value >= target;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 80" className="w-36">
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${bgLargeArc} 0 ${bgEnd.x} ${bgEnd.y}`}
          fill="none"
          className="stroke-fin-sand"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {pct > 0 && (
          <path
            d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${valLargeArc} 0 ${valEnd.x} ${valEnd.y}`}
            fill="none"
            className={atOrAbove ? "stroke-fin-teal" : "stroke-gda-red"}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {targetPos && (
          <circle
            cx={targetPos.x}
            cy={targetPos.y}
            r="4"
            className="fill-fin-stone"
          />
        )}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-fin-ink"
          fontSize="18"
          fontWeight="600"
        >
          {value.toFixed(1)}%
        </text>
      </svg>
      <span className="mt-1 text-[12px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {target != null && (
        <span
          className={cn(
            "text-[12px]",
            atOrAbove ? "text-gda-green" : "text-gda-red",
          )}
        >
          Target: {target.toFixed(1)}%
        </span>
      )}
    </div>
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
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">
          No margin data for this period yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-fin-ink">Profit Margin</h3>
      <p className="mb-4 text-[12px] text-muted-foreground">
        Period and YTD margin with target markers
      </p>
      <div className="flex items-center justify-center gap-8">
        {periodMargin != null && (
          <ArcGauge
            value={periodMargin}
            target={targetPeriodMargin}
            label="Period"
          />
        )}
        {ytdMargin != null && (
          <ArcGauge
            value={ytdMargin}
            target={targetYtdMargin}
            label="YTD"
          />
        )}
      </div>
    </div>
  );
}
