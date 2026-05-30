import type { MetricProps } from '../../types';

const trendIndicator: Record<string, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

export function Metric({ label, value, unit, sourceUrl, sourceKind, trend }: MetricProps) {
  return (
    <div className="flex flex-col gap-1" data-testid="data-point-metric">
      <span className="text-xs text-ink-muted">{label}</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-baseline gap-1 text-lg font-semibold text-ink-primary hover:text-accent transition-colors"
        data-source-kind={sourceKind}
      >
        <span data-numeric>{value}</span>
        {unit && <span className="text-xs text-ink-muted font-normal">{unit}</span>}
        {trend && <span className={`text-xs ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-critical' : 'text-ink-muted'}`}>{trendIndicator[trend]}</span>}
      </a>
    </div>
  );
}
