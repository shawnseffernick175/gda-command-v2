import type { PanelProps } from '../../types';

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div className={`rounded-md border border-border bg-surface p-6 ${className}`}>
      {title && <h3 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-4">{title}</h3>}
      {children}
    </div>
  );
}
