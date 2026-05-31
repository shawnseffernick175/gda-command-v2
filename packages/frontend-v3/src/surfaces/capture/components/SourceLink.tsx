import type { SourceCitation } from '../types';

interface SourceLinkProps {
  sources: SourceCitation[];
}

export function SourceLink({ sources }: SourceLinkProps) {
  if (sources.length === 0) return null;

  const primary = sources[0]!;
  return (
    <a
      href={primary.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border bg-surface-raised text-xs font-medium text-ink-primary hover:text-accent transition-colors"
      data-source-url={primary.url}
      title={primary.title}
    >
      <span className="text-ink-muted">{primary.kind}</span>
      <span className="text-ink-dim">&rarr;</span>
    </a>
  );
}
