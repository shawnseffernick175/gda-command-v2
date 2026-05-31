import type { FastTrackResult } from './types';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const gradeClasses: Record<string, string> = {
  A: 'bg-success/15 text-success',
  B: 'bg-warning/15 text-warning',
  C: 'bg-critical/15 text-critical',
};

const actionClasses: Record<string, string> = {
  pursue: 'bg-success/15 text-success',
  watch: 'bg-accent/15 text-accent',
  skip: 'bg-warning/15 text-warning',
};

interface HistoryListProps {
  items: FastTrackResult[];
  isLoading: boolean;
  nextCursor: string | null;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
}

export function HistoryList({ items, isLoading, nextCursor, onLoadMore, onSelect }: HistoryListProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded-sm border border-border bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-ink-muted py-8 text-center" data-testid="history-empty">
        No recent assessments. Paste an opportunity above to triage.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0" data-testid="history-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="flex items-center gap-3 px-3 py-2 border-b border-border text-left hover:bg-canvas transition-colors w-full"
          onClick={() => onSelect(item.id)}
        >
          <span className={`inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-semibold ${gradeClasses[item.grade] || ''}`}>
            {item.grade}
          </span>
          <span className="flex-1 text-sm text-ink-primary truncate">{item.id}</span>
          <span className={`inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-medium capitalize ${actionClasses[item.recommended_action] || ''}`}>
            {item.recommended_action}
          </span>
          <span className="text-xs text-ink-muted whitespace-nowrap">{relativeTime(item.generated_at)}</span>
        </button>
      ))}
      {nextCursor && (
        <button
          type="button"
          className="mt-2 h-8 px-4 rounded-sm border border-border bg-surface text-sm text-ink-primary font-medium hover:bg-canvas transition-colors self-center"
          onClick={onLoadMore}
          disabled={isLoading}
        >
          {isLoading ? 'Loading…' : 'Load older'}
        </button>
      )}
    </div>
  );
}
