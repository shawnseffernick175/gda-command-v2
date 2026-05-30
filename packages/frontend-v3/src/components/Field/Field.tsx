import type { FieldProps } from '../../types';

export function Field({ label, value, sourceUrl, sourceKind }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5" data-testid="data-point-field">
      <span className="text-xs text-ink-muted">{label}</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-ink-primary hover:text-accent transition-colors"
        data-source-kind={sourceKind}
      >
        {value}
      </a>
    </div>
  );
}
