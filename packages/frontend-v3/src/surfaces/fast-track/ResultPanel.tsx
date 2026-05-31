import type { FastTrackResult } from './types';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

const gradeClasses: Record<string, string> = {
  A: 'bg-success/15 text-success border-success/30',
  B: 'bg-warning/15 text-warning border-warning/30',
  C: 'bg-critical/15 text-critical border-critical/30',
};

const actionClasses: Record<string, string> = {
  pursue: 'bg-success/15 text-success border-success/30',
  watch: 'bg-accent/15 text-accent border-accent/30',
  skip: 'bg-warning/15 text-warning border-warning/30',
};

interface ResultPanelProps {
  result: FastTrackResult;
}

export function ResultPanel({ result }: ResultPanelProps) {
  function handleCopyLink() {
    const url = `${window.location.origin}/fast-track?id=${result.id}`;
    navigator.clipboard.writeText(url);
  }

  const sourceUrl = result.source_chips.length > 0 ? result.source_chips[0]!.url : '';

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-white p-6" data-testid="result-panel">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Grade:</span>
          <span
            className={`inline-flex items-center h-6 px-2 rounded-full border text-xs font-semibold ${gradeClasses[result.grade] || ''}`}
            data-grade={result.grade}
            data-source-url={sourceUrl}
          >
            {result.grade}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Recommended:</span>
          <span
            className={`inline-flex items-center h-6 px-2 rounded-full border text-xs font-semibold capitalize ${actionClasses[result.recommended_action] || ''}`}
            data-recommended-action={result.recommended_action}
            data-source-url={sourceUrl}
          >
            {result.recommended_action}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">NAICS match score:</span>
        <span
          className="text-sm font-medium text-ink-primary nums"
          data-stat="naics-match-score"
          data-source-url={sourceUrl}
        >
          {result.naics_match_score} / 100
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Rationale:</span>
        <div className="text-sm text-ink-primary leading-relaxed">
          {result.rationale.split('\n\n').map((para, idx) => (
            <p key={idx} className={idx > 0 ? 'mt-2' : ''}>
              {para}
            </p>
          ))}
        </div>
      </div>

      {result.source_chips.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Sources ({result.source_chips.length}):</span>
          <div className="flex flex-wrap gap-1" data-testid="source-chips-section">
            {result.source_chips.map((chip, idx) => (
              <a
                key={idx}
                href={chip.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border bg-surface-raised text-xs font-medium text-ink-primary hover:text-accent transition-colors"
                title={`${chip.title} — Retrieved ${relativeTime(chip.retrieved_at)}`}
                data-source-url={chip.url}
              >
                <span className="text-ink-muted">{chip.title}</span>
                <span className="text-ink-dim">→</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-ink-muted border-t border-border pt-3 mt-2">
        <span>Model: {result.model_used}</span>
        <span>Generated: {relativeTime(result.generated_at)}{result.cache_hit ? ' (cached)' : ''}</span>
      </div>

      <div className="flex items-center gap-2">
        <a
          href={`/opportunities/new?prefill=${result.id}`}
          className="h-8 px-4 rounded-sm border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors inline-flex items-center"
        >
          Save to Opportunities
        </a>
        <button
          type="button"
          className="h-8 px-4 rounded-sm border border-border bg-surface text-sm text-ink-primary font-medium hover:bg-canvas transition-colors"
          onClick={handleCopyLink}
        >
          Copy Share Link
        </button>
      </div>
    </div>
  );
}
