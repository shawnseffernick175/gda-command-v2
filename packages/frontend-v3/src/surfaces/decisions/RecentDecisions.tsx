/**
 * RecentDecisions — summary of last 7 days of decisions for the Launchpad.
 */

import { Skeleton } from '../../components/Skeleton/Skeleton';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { useRecentDecisions } from './hooks/useDecisions';
import { DECISION_KIND_LABELS } from './types';
import type { AgentDecision } from './types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function DecisionSummaryRow({ decision }: { decision: AgentDecision }) {
  const isPositive = ['qualify', 'bid', 'win', 'team_with'].includes(decision.kind);
  const isNegative = ['kill', 'no_bid', 'loss', 'avoid_team', 'withdraw'].includes(decision.kind);

  const kindColor = isPositive
    ? 'text-accent'
    : isNegative
      ? 'text-critical'
      : 'text-ink-muted';

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
      <span className={`text-xs font-semibold w-20 shrink-0 ${kindColor}`}>
        {DECISION_KIND_LABELS[decision.kind] ?? decision.kind}
      </span>
      <span className="text-sm text-ink-primary flex-1 min-w-0 truncate">
        {decision.rationale}
      </span>
      <span className="text-xs text-ink-muted shrink-0">
        {formatDate(decision.made_at)}
      </span>
      <span className="text-xs text-ink-muted shrink-0">
        {decision.made_by}
      </span>
    </div>
  );
}

export function RecentDecisions() {
  const { data, isLoading, isError, error, refetch } = useRecentDecisions();

  return (
    <div
      className="bg-white border border-border rounded p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      data-testid="recent-decisions"
    >
      <h3 className="text-[20px] leading-7 font-semibold text-ink-primary mb-4">
        Recent Decisions
      </h3>

      {isLoading && (
        <div data-testid="recent-decisions-loading">
          <Skeleton lines={4} />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load recent decisions"
          {...(error instanceof Error ? { description: error.message } : {})}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <p className="text-sm text-ink-muted" data-testid="recent-decisions-empty">
          No decisions in the last 7 days.
        </p>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col">
          {data.map((d) => (
            <DecisionSummaryRow key={d.id} decision={d} />
          ))}
        </div>
      )}
    </div>
  );
}
