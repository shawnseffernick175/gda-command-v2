import type { SourceUrlChipProps } from '../../types';

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Retrieved ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Retrieved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Retrieved ${days}d ago`;
}

export function SourceUrlChip({ url, source_kind, retrieved_at, label, ...rest }: SourceUrlChipProps & Record<string, unknown>) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border bg-surface-raised text-xs font-medium text-ink-primary hover:text-accent transition-colors"
      title={relativeTime(retrieved_at)}
      data-source-kind={source_kind}
      data-testid={(rest['data-testid'] as string) || 'data-point-source-url-chip'}
    >
      <span className="text-ink-muted">{label || extractDomain(url)}</span>
      <span className="text-ink-dim">→</span>
    </a>
  );
}
