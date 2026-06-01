/**
 * PwinBreakdown — displays PWin score with plain-language breakdown.
 * Shows score, top drivers, model version, and full rule contributions.
 */

import { Skeleton } from '../../components/Skeleton/Skeleton';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { SourceLink } from '../opportunities/components/SourceLink';
import { usePwinScore, usePwinModel } from './hooks/useDecisions';
import type { RuleContribution } from './types';
import type { SourceRef } from '../opportunities/types';

function ScoreGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'text-accent' : score >= 40 ? 'text-ink-primary' : 'text-critical';

  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-[32px] leading-[40px] font-semibold tracking-[-0.01em] ${color}`}>
        {score}%
      </span>
      <span className="text-sm text-ink-muted">PWin</span>
    </div>
  );
}

function DriversList({ drivers }: { drivers: string[] }) {
  if (drivers.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
        Top Drivers
      </h4>
      <ul className="flex flex-col gap-0.5">
        {drivers.map((d, i) => (
          <li key={i} className="text-sm text-ink-primary">
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContributionBar({ contribution }: { contribution: RuleContribution }) {
  const isPositive = contribution.value > 0;
  const isNeutral = contribution.value === 0;
  const barColor = isNeutral
    ? 'bg-border'
    : isPositive
      ? 'bg-accent'
      : 'bg-critical';

  const barWidth = Math.min(Math.abs(contribution.value) * 2, 100);

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-ink-muted w-24 shrink-0 text-right tabular-nums">
        {contribution.value > 0 ? '+' : ''}{contribution.value}
      </span>
      <div className="flex-1 h-2 bg-surface-raised rounded overflow-hidden">
        <div
          className={`h-full rounded ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className="text-xs text-ink-muted flex-1 min-w-0 truncate">
        {contribution.name.replace(/_/g, ' ')}
      </span>
    </div>
  );
}

interface PwinBreakdownProps {
  opportunityId: string;
}

export function PwinBreakdown({ opportunityId }: PwinBreakdownProps) {
  const score = usePwinScore(opportunityId);
  const model = usePwinModel();

  if (score.isLoading) {
    return (
      <div className="flex flex-col gap-2" data-testid="pwin-loading">
        <Skeleton lines={2} />
        <Skeleton variant="rect" height={80} />
      </div>
    );
  }

  if (score.isError) {
    return (
      <ErrorState
        title="PWin score unavailable"
        description={score.error instanceof Error ? score.error.message : 'Score computation failed. Ensure features have been computed for this opportunity.'}
      />
    );
  }

  if (!score.data) return null;

  const { score: pwinScore, model_version, feature_weights = [], top_drivers = [], confidence } = score.data;

  const narrative = buildNarrative(pwinScore, top_drivers);

  const modelSourceRef: SourceRef[] = [{
    kind: 'internal',
    title: `PWin model ${model_version}`,
    url: `/v3/pwin/model`,
    retrieved_at: new Date().toISOString(),
  }];

  return (
    <div className="flex flex-col gap-4" data-testid="pwin-breakdown">
      <div className="flex items-start justify-between">
        <SourceLink
          value={<ScoreGauge score={pwinScore} />}
          sources={modelSourceRef}
          data-testid="source-link-pwin-score"
        />
        {confidence != null && (
          <span className="text-xs text-ink-muted mt-1">
            Confidence: {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      <SourceLink
        value={<p className="text-sm text-ink-primary" data-testid="pwin-narrative">{narrative}</p>}
        sources={modelSourceRef}
        data-testid="source-link-pwin-narrative"
      />

      <DriversList drivers={top_drivers} />

      {feature_weights.length > 0 && (
        <div className="flex flex-col gap-0.5" data-testid="pwin-contributions">
          <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-1">
            Score Breakdown
          </h4>
          {feature_weights
            .filter((c) => c.name !== 'base')
            .map((c) => (
              <ContributionBar key={c.name} contribution={c} />
            ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-ink-muted" data-testid="pwin-model-info">
        <SourceLink
          value={<span>Scored by {model_version}</span>}
          sources={modelSourceRef}
          data-testid="source-link-pwin-model"
        />
        {model.data && (
          <>
            <span>|</span>
            <span>
              Trained on {model.data.trained_on_outcomes_count ?? 0} outcomes
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function buildNarrative(score: number, drivers: string[]): string {
  if (drivers.length === 0) return `${score}% probability of win.`;

  const parts = drivers.slice(0, 3).join(', ');
  const remaining = drivers.length > 3 ? ` and ${drivers.length - 3} more factor(s)` : '';

  return `${score}% \u2014 ${parts}${remaining}.`;
}
