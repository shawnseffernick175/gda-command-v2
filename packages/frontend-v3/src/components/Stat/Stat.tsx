import type { StatProps } from '../../types';

export function Stat({ label, value, sourceUrl, sourceKind }: StatProps) {
  return (
    <div className="flex flex-col gap-1" data-testid="data-point-stat">
      <span className="text-xs text-ink-muted">{label}</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-2xl font-semibold text-ink-primary hover:text-accent transition-colors"
        data-source-kind={sourceKind}
      >
        <span data-numeric>{value}</span>
      </a>
    </div>
  );
}
