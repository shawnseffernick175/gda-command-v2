"use client";

import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

export function MonthlyRevenueTrend({ items }: { items: ProjectFullRow[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No monthly trend data yet</p>
      </div>
    );
  }

  const periods = items.map((r) => r.period);
  const actuals = items.map((r) => r.actual_period_revenue ?? null);
  const targets = items.map((r) =>
    r.target_period_revenue > 0 ? r.target_period_revenue : null,
  );

  const allVals = [...actuals, ...targets].filter((v): v is number => v != null);
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 1;
  const minVal = allVals.length > 0 ? Math.min(...allVals, 0) : 0;
  const range = maxVal - minVal || 1;

  const svgW = 400;
  const svgH = 200;
  const padX = 10;
  const padTop = 16;
  const padBot = 4;
  const chartW = svgW - padX * 2;
  const chartH = svgH - padTop - padBot;

  function toX(i: number): number {
    return padX + (items.length > 1 ? (i / (items.length - 1)) * chartW : chartW / 2);
  }
  function toY(v: number): number {
    return padTop + chartH - ((v - minVal) / range) * chartH;
  }

  function buildPolyline(vals: (number | null)[]): string[] {
    const segments: string[] = [];
    let current = "";
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null) {
        if (current) segments.push(current);
        current = "";
        continue;
      }
      const x = toX(i).toFixed(1);
      const y = toY(v).toFixed(1);
      current += current ? ` L ${x} ${y}` : `M ${x} ${y}`;
    }
    if (current) segments.push(current);
    return segments;
  }

  const actualPaths = buildPolyline(actuals);
  const targetPaths = buildPolyline(targets);

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-fin-ink">Monthly Revenue Trend</h3>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padTop + chartH * (1 - frac);
          const val = minVal + range * frac;
          return (
            <g key={frac}>
              <line
                x1={padX}
                y1={y}
                x2={svgW - padX}
                y2={y}
                className="stroke-fin-sand"
                strokeWidth="0.5"
                strokeDasharray="3 3"
              />
              <text
                x={padX - 2}
                y={y + 3}
                textAnchor="end"
                className="fill-fin-stone"
                fontSize="8"
              >
                {formatMoney(val)}
              </text>
            </g>
          );
        })}

        {/* Target paths (dashed) */}
        {targetPaths.map((d, i) => (
          <path
            key={`t-${i}`}
            d={d}
            fill="none"
            className="stroke-fin-stone"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        ))}

        {/* Actual paths */}
        {actualPaths.map((d, i) => (
          <path
            key={`a-${i}`}
            d={d}
            fill="none"
            className="stroke-fin-teal"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}

        {/* Actual dots */}
        {actuals.map((v, i) =>
          v != null ? (
            <circle
              key={`ad-${i}`}
              cx={toX(i)}
              cy={toY(v)}
              r="3.5"
              className="fill-fin-teal"
            />
          ) : null,
        )}

        {/* Target dots */}
        {targets.map((v, i) =>
          v != null ? (
            <circle
              key={`td-${i}`}
              cx={toX(i)}
              cy={toY(v)}
              r="2.5"
              className="fill-fin-stone"
            />
          ) : null,
        )}

        {/* X-axis labels */}
        {periods.map((p, i) => (
          <text
            key={p}
            x={toX(i)}
            y={svgH - 1}
            textAnchor="middle"
            className="fill-fin-stone"
            fontSize="8"
          >
            {p.replace(/^FY\d+\s*/, "")}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-fin-teal" />
          Actual Revenue
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-fin-stone" />
          Target
        </span>
      </div>
    </div>
  );
}
