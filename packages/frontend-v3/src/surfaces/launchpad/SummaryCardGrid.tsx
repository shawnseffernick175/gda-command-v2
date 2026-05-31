import { useNavigate } from 'react-router-dom';
import type { LaunchpadSummary, SourceCitation } from './types';

interface CardDef {
  key: keyof Pick<LaunchpadSummary, 'qualified_due_this_week' | 'pipeline_no_capture' | 'captures_color_review_stale' | 'action_items_open_today' | 'action_items_overdue'>;
  sourcesKey: keyof Pick<LaunchpadSummary, 'qualified_due_this_week_sources' | 'pipeline_no_capture_sources' | 'captures_color_review_stale_sources' | 'action_items_open_today_sources' | 'action_items_overdue_sources'>;
  label: string;
  href: string;
  escalation: (v: number) => 'critical' | 'warning' | 'info' | null;
}

const CARDS: CardDef[] = [
  {
    key: 'qualified_due_this_week',
    sourcesKey: 'qualified_due_this_week_sources',
    label: 'Qualified \u2014 Due This Week',
    href: '/opportunities?status=qualified&due=this_week',
    escalation: (v) => (v > 5 ? 'warning' : null),
  },
  {
    key: 'pipeline_no_capture',
    sourcesKey: 'pipeline_no_capture_sources',
    label: 'Pipeline \u2014 No Capture',
    href: '/pipeline?missing_capture=1',
    escalation: (v) => (v > 0 ? 'warning' : null),
  },
  {
    key: 'captures_color_review_stale',
    sourcesKey: 'captures_color_review_stale_sources',
    label: 'Captures \u2014 Color Review Stale',
    href: '/capture?stale=1',
    escalation: (v) => (v > 0 ? 'critical' : null),
  },
  {
    key: 'action_items_open_today',
    sourcesKey: 'action_items_open_today_sources',
    label: 'Action Items \u2014 Open Today',
    href: '/action-items?due=today',
    escalation: () => 'info',
  },
  {
    key: 'action_items_overdue',
    sourcesKey: 'action_items_overdue_sources',
    label: 'Action Items \u2014 Overdue',
    href: '/action-items?overdue=1',
    escalation: (v) => (v > 0 ? 'critical' : null),
  },
];

const severityBorder: Record<string, string> = {
  critical: 'border-l-4 border-l-critical',
  warning: 'border-l-4 border-l-warning',
  info: 'border-l-4 border-l-accent',
};

function SourcePill({ citation }: { citation: SourceCitation }) {
  const isExternal = citation.url.startsWith('http');
  const indicator = isExternal ? '\u2197' : '#';
  return (
    <span
      className="inline-flex items-center gap-1 h-5 px-2 rounded-full border border-border bg-surface-raised text-xs text-ink-muted"
      title={`${citation.title} \u2014 Retrieved: ${new Date(citation.retrieved_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}`}
      data-testid="source-pill"
    >
      <span>{citation.title}</span>
      <span>{indicator}</span>
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-sm border border-border bg-surface p-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-12 bg-surface-raised rounded-sm mb-2" />
      <div className="h-4 w-32 bg-surface-raised rounded-sm mb-3" />
      <div className="h-5 w-24 bg-surface-raised rounded-full" />
    </div>
  );
}

interface SummaryCardGridProps {
  data: LaunchpadSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function SummaryCardGrid({ data, isLoading, isError, error, refetch }: SummaryCardGridProps) {
  const navigate = useNavigate();

  if (isError) {
    return (
      <div className="rounded-sm border border-critical/30 bg-critical/5 p-4 flex items-center justify-between" role="alert">
        <p className="text-sm text-ink-primary">Failed to load summary: {error?.message ?? 'Unknown error'}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="h-8 px-4 rounded-sm border border-border bg-surface text-xs font-medium text-ink-primary hover:bg-surface-raised transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {CARDS.map((card) => {
        const value = data[card.key];
        const sources = data[card.sourcesKey];
        const severity = card.escalation(value);
        const tint = severity ? severityBorder[severity] : '';
        const primarySource = sources[0];

        return (
          <a
            key={card.key}
            href={card.href}
            onClick={(e) => {
              e.preventDefault();
              navigate(card.href);
            }}
            className={`rounded-sm border border-border bg-surface p-6 hover:bg-surface-raised transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${tint}`}
            aria-label={`${card.label}: ${value}`}
            data-stat={card.key}
            data-source-url={primarySource?.url ?? ''}
          >
            <span className="block text-2xl font-semibold text-ink-primary" data-numeric>
              {value}
            </span>
            <span className="block text-xs text-ink-muted mt-1">{card.label}</span>
            {sources.length > 0 && (
              <span className="flex flex-wrap gap-1 mt-3">
                {sources.map((src, i) => (
                  <SourcePill key={i} citation={src} />
                ))}
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}
