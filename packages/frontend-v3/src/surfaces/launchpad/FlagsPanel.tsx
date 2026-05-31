import type { LaunchpadFlagsResult, LaunchpadFlag, SourceCitation } from './types';

function formatRelativeDate(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const todayEst = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const targetEst = new Date(target.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  todayEst.setHours(0, 0, 0, 0);
  targetEst.setHours(0, 0, 0, 0);

  const diffDays = Math.round((targetEst.getTime() - todayEst.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0) return `in ${diffDays}d`;
  return `${Math.abs(diffDays)}d ago`;
}

const severityDot: Record<string, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  info: 'bg-accent',
};

const severityLabel: Record<string, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

function SourcePill({ citation }: { citation: SourceCitation }) {
  const isExternal = citation.url.startsWith('http');
  const indicator = isExternal ? '\u2197' : '#';
  return (
    <a
      href={citation.url}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="inline-flex items-center gap-1 h-5 px-2 rounded-full border border-border bg-surface-raised text-xs text-ink-muted hover:text-accent transition-colors"
      title={`${citation.title} \u2014 Retrieved: ${new Date(citation.retrieved_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}`}
      data-testid="data-point-source-pill"
    >
      <span>{citation.title}</span>
      <span>{indicator}</span>
    </a>
  );
}

function FlagRow({ flag }: { flag: LaunchpadFlag }) {
  const sourceUrl = flag.source_url ?? flag.source_url_sources[0]?.url ?? null;

  return (
    <li
      className="flex items-start gap-3 py-3 border-b border-border last:border-b-0"
      data-flag-id={flag.id}
      data-source-url={sourceUrl ?? ''}
    >
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${severityDot[flag.severity]}`}
        aria-hidden="true"
      />
      <span className="sr-only">{severityLabel[flag.severity]}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-ink-primary">{flag.title}</span>
        {flag.detail && (
          <p
            className="text-xs text-ink-muted mt-0.5 truncate"
            title={flag.detail}
          >
            {flag.detail}
          </p>
        )}
        <span className="flex flex-wrap items-center gap-2 mt-1">
          {flag.due_date && (
            <span className="text-xs text-ink-dim">{formatRelativeDate(flag.due_date)}</span>
          )}
          {flag.doctrine_anchor && (
            <span className="inline-flex h-5 px-2 rounded-full border border-border text-xs italic text-ink-muted">
              {flag.doctrine_anchor}
            </span>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target={sourceUrl.startsWith('http') ? '_blank' : undefined}
              rel={sourceUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-xs text-accent hover:underline"
              data-testid="flag-source-link"
            >
              Source {sourceUrl.startsWith('http') ? '\u2197' : '#'}
            </a>
          )}
          {!sourceUrl && flag.source_url_sources.length > 0 && (
            <span className="flex gap-1">
              {flag.source_url_sources.map((src, i) => (
                <SourcePill key={i} citation={src} />
              ))}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

function RollupSkeleton() {
  return (
    <div className="animate-pulse flex gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="h-6 w-8 bg-surface-raised rounded-sm" />
          <div className="h-4 w-20 bg-surface-raised rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function FlagListSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-3 mt-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <div className="w-2 h-2 rounded-full bg-surface-raised mt-1.5" />
          <div className="flex-1">
            <div className="h-4 w-48 bg-surface-raised rounded-sm mb-1" />
            <div className="h-3 w-64 bg-surface-raised rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface FlagsPanelProps {
  data: LaunchpadFlagsResult | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function FlagsPanel({ data, isLoading, isError, error, refetch }: FlagsPanelProps) {
  if (isError) {
    return (
      <div className="rounded-sm border border-critical/30 bg-critical/5 p-4 flex items-center justify-between" role="alert">
        <p className="text-sm text-ink-primary">Failed to load flags: {error?.message ?? 'Unknown error'}</p>
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
      <div className="rounded-sm border border-border bg-surface p-6">
        <RollupSkeleton />
        <FlagListSkeleton />
      </div>
    );
  }

  const rollups = [
    { label: 'Compliance Gaps', value: data.compliance_gaps, sources: data.compliance_gaps_sources },
    { label: 'Teaming Unresolved', value: data.teaming_unresolved, sources: data.teaming_unresolved_sources },
    { label: 'Analysis Timeouts (24h)', value: data.analysis_timeouts_24h, sources: data.analysis_timeouts_24h_sources },
  ];

  return (
    <div className="rounded-sm border border-border bg-surface p-6">
      <div className="flex flex-wrap gap-6 mb-4 pb-4 border-b border-border">
        {rollups.map((r) => (
          <div key={r.label} className="flex flex-col gap-1" data-stat={r.label} data-source-url={r.sources[0]?.url ?? ''}>
            <span className="text-lg font-semibold text-ink-primary" data-numeric>{r.value}</span>
            <span className="text-xs text-ink-muted">{r.label}</span>
            {r.sources.length > 0 && (
              <span className="flex gap-1 mt-1">
                {r.sources.map((src, i) => (
                  <SourcePill key={i} citation={src} />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      {data.flags.length === 0 ? (
        <div className="flex items-center gap-2 py-6 justify-center text-sm text-ink-muted">
          <span aria-hidden="true">✓</span>
          <span>All clear — no open flags.</span>
        </div>
      ) : (
        <ul className="list-none p-0 m-0" aria-label="Launchpad flags">
          {data.flags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} />
          ))}
        </ul>
      )}
    </div>
  );
}
