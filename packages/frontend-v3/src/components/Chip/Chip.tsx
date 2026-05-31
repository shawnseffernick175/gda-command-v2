import type { ChipProps } from '../../types';

const confidenceClasses: Record<string, string> = {
  high: 'bg-success/15 text-success',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-critical/15 text-critical',
};

const statusClasses: Record<string, string> = {
  qualified: 'bg-accent/15 text-accent',
  pursuing: 'bg-accent/15 text-accent',
  submitted: 'bg-accent/15 text-accent',
  won: 'bg-success/15 text-success',
  lost: 'bg-ink-dim/15 text-ink-dim',
  blocked: 'bg-critical/15 text-critical',
};

export function Chip({ label, variant = 'default', level, status, sourceUrl, onRemove, onClick }: ChipProps) {
  const base = 'inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-medium border';

  let cls = 'border-border bg-surface-raised text-ink-primary';
  if (variant === 'confidence' && level) cls = `border-transparent ${confidenceClasses[level]}`;
  if (variant === 'status' && status) cls = `border-transparent ${statusClasses[status]}`;
  if (variant === 'source' && sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`${base} border-border bg-surface-raised text-ink-primary hover:text-accent transition-colors`}>
        {label}
        <span className="text-ink-dim">→</span>
      </a>
    );
  }

  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag className={`${base} ${cls} ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      {label}
      {onRemove && (
        <button type="button" className="ml-1 text-ink-dim hover:text-ink-primary" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={`Remove ${label}`}>
          ×
        </button>
      )}
    </Tag>
  );
}
