import type { MarginCheck } from '../types';

interface MarginGaugeProps {
  margin: MarginCheck;
}

export function MarginGauge({ margin }: MarginGaugeProps) {
  const pct = Math.min(Math.max(margin.projected_margin, 0), 20);
  const floorPct = margin.floor;
  const barWidth = (pct / 20) * 100;
  const floorPosition = (floorPct / 20) * 100;

  return (
    <div className="border border-border rounded-sm p-4 bg-surface">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          Margin Check
        </h4>
        <span className={`text-sm font-semibold ${margin.pass ? 'text-success' : 'text-critical'}`}>
          {margin.pass ? 'PASS' : 'FAIL'}
        </span>
      </div>

      <div className="relative h-6 bg-surface-raised rounded-sm border border-border overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-sm transition-all duration-[var(--duration-reveal)] ${margin.pass ? 'bg-success' : 'bg-critical'}`}
          style={{ width: `${barWidth}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-ink-muted"
          style={{ left: `${floorPosition}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1 text-xs text-ink-muted">
        <span>0%</span>
        <span>Projected: {margin.projected_margin}% | Floor: {margin.floor}%</span>
        <span>20%</span>
      </div>
    </div>
  );
}
