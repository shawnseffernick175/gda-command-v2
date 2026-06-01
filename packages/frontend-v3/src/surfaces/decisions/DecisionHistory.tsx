/**
 * DecisionHistory — chronological decision log for an entity.
 * Shows every prior decision (qualify, kill, team, override, outcome).
 */

import { Skeleton } from '../../components/Skeleton/Skeleton';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { useEntityDecisions } from './hooks/useDecisions';
import { DECISION_KIND_LABELS } from './types';
import type { AgentDecision, EntityKind } from './types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
}

function KindBadge({ kind }: { kind: AgentDecision['kind'] }) {
  const isPositive = ['qualify', 'bid', 'win', 'team_with'].includes(kind);
  const isNegative = ['kill', 'no_bid', 'loss', 'avoid_team', 'withdraw'].includes(kind);

  const colorClasses = isPositive
    ? 'bg-accent/10 text-accent border-accent/30'
    : isNegative
      ? 'bg-critical/10 text-critical border-critical/30'
      : 'bg-ink-dim/10 text-ink-muted border-border';

  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded text-[11px] font-semibold border ${colorClasses}`}
    >
      {DECISION_KIND_LABELS[kind] ?? kind}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const isWin = outcome === 'won';
  const colorClasses = isWin
    ? 'bg-accent/10 text-accent border-accent/30'
    : 'bg-ink-dim/10 text-ink-muted border-border';

  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded text-[11px] font-semibold border uppercase ${colorClasses}`}
    >
      {outcome}
    </span>
  );
}

function DecisionRow({ decision }: { decision: AgentDecision }) {
  return (
    <div
      className="flex flex-col gap-1 py-3 border-b border-border last:border-b-0"
      data-testid="decision-row"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <KindBadge kind={decision.kind} />
        <span className="text-xs text-ink-muted">
          {formatDate(decision.made_at)} {formatTime(decision.made_at)}
        </span>
        <span className="text-xs text-ink-muted">by {decision.made_by}</span>
        {decision.doctrine_alignment_score != null && (
          <span className="text-xs text-ink-muted">
            Doctrine: {decision.doctrine_alignment_score}/40
          </span>
        )}
        {decision.outcome && <OutcomeBadge outcome={decision.outcome} />}
      </div>
      <p className="text-sm text-ink-primary">{decision.rationale}</p>
      {decision.evidence_refs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {decision.evidence_refs.map((ref, i) => (
            <a
              key={i}
              href={ref.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline"
            >
              {ref.source_type}
              {ref.grade ? ` (${ref.grade})` : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

interface DecisionHistoryProps {
  entityKind: EntityKind;
  entityId: string;
}

export function DecisionHistory({ entityKind, entityId }: DecisionHistoryProps) {
  const { data, isLoading, isError, error } = useEntityDecisions(entityKind, entityId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" data-testid="decision-history-loading">
        <Skeleton lines={3} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load decision history"
        {...(error instanceof Error ? { description: error.message } : {})}
      />
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <p className="text-sm text-ink-muted py-2" data-testid="decision-history-empty">
        No decisions recorded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col" data-testid="decision-history">
      {data.map((d) => (
        <DecisionRow key={d.id} decision={d} />
      ))}
    </div>
  );
}
