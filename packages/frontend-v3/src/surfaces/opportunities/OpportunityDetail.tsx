import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { useOpportunityDetail } from './hooks/useOpportunityDetail';
import { useQualifyOpportunity } from './hooks/useQualifyOpportunity';
import { GradeChip } from './components/GradeChip';
import { StatusChip } from './components/StatusChip';
import { SourceLink } from './components/SourceLink';
import { QualifyConfirmModal } from './QualifyConfirmModal';
import type { OpportunityDetail as OpportunityDetailType } from './types';

interface OpportunityDetailPanelProps {
  opportunityId: string;
  onBack: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function AnalysisSection({ detail }: { detail: OpportunityDetailType }) {
  const { analysis } = detail;
  if (!analysis) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="analysis-result">
      <div className="flex items-center gap-3">
        {detail.grade && <GradeChip grade={detail.grade} sources={detail.grade_sources} />}
        <SourceLink
          value={<span className="text-sm font-medium">Pwin: {Math.round(analysis.pwin * 100)}%</span>}
          sources={analysis.pwin_sources}
          data-testid="source-link-pwin"
        />
      </div>

      {detail.grade_evidence && (
        <div>
          <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-1">Rationale</h4>
          <p className="text-sm text-ink-primary">{detail.grade_evidence}</p>
        </div>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-1">NAICS Match</h4>
        <SourceLink
          value={<span className="text-sm text-ink-primary">{detail.naics ?? '—'}</span>}
          sources={detail.naics_sources}
          data-testid="source-link-naics"
        />
      </div>

      {analysis.wargame && (
        <div>
          <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-1">Recommended Action</h4>
          <p className="text-sm text-ink-primary">{analysis.wargame.strategy}</p>
        </div>
      )}

      {analysis.competitors.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-1">Competitors</h4>
          <div className="flex flex-wrap gap-2">
            {analysis.competitors.map((c) => (
              <span
                key={c.name}
                className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border ${
                  c.threat_level === 'high'
                    ? 'bg-critical/15 text-critical border-critical/30'
                    : c.threat_level === 'medium'
                      ? 'bg-warning/15 text-warning border-warning/30'
                      : 'bg-ink-dim/15 text-ink-muted border-border'
                }`}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OpportunityDetailPanel({ opportunityId, onBack }: OpportunityDetailPanelProps) {
  const { detail, isLoading, isError, error, analysisTimeout, analysisLoading, retryAnalysis } =
    useOpportunityDetail(opportunityId);
  const qualifyMutation = useQualifyOpportunity();
  const [qualifyOpen, setQualifyOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        <Skeleton lines={3} />
        <Skeleton variant="rect" height={120} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Failed to load opportunity" {...(error?.message ? { description: error.message } : {})} onRetry={onBack} />;
  }

  if (!detail) return null;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="opportunity-detail">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-sm text-ink-muted hover:text-ink-primary transition-colors"
          onClick={onBack}
        >
          &larr; Back to list
        </button>
        <div className="flex items-center gap-2">
          <StatusChip status={detail.status} />
          {detail.status !== 'qualified' && (
            <Button variant="primary" onClick={() => setQualifyOpen(true)}>
              Qualify
            </Button>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-ink-primary">
          <SourceLink value={detail.title} sources={detail.title_sources} data-testid="source-link-title" />
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-border pb-6">
        <div>
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">Agency</span>
          <p className="text-sm text-ink-primary mt-1">
            <SourceLink value={detail.agency ?? '—'} sources={detail.agency_sources} data-testid="source-link-agency" />
          </p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">NAICS</span>
          <p className="text-sm text-ink-primary mt-1">
            <SourceLink value={detail.naics ?? '—'} sources={detail.naics_sources} data-testid="source-link-naics-meta" />
          </p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">Set-Aside</span>
          <p className="text-sm text-ink-primary mt-1">
            <SourceLink value={detail.set_aside ?? '—'} sources={detail.set_aside_sources} data-testid="source-link-set-aside" />
          </p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">Response Due</span>
          <p className="text-sm text-ink-primary mt-1">
            <SourceLink
              value={formatDate(detail.response_due_at)}
              sources={detail.response_due_at_sources}
              data-testid="source-link-response-due"
            />
          </p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">Posted</span>
          <p className="text-sm text-ink-primary mt-1">{formatDate(detail.posted_at)}</p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">Value Range</span>
          <p className="text-sm text-ink-primary mt-1">
            {detail.value_min != null || detail.value_max != null ? (
              <SourceLink
                value={`$${(detail.value_min ?? 0).toLocaleString()} – $${(detail.value_max ?? 0).toLocaleString()}`}
                sources={detail.value_min_sources}
                data-testid="source-link-value"
              />
            ) : '—'}
          </p>
        </div>
      </div>

      {detail.description && (
        <div className="border-b border-border pb-6">
          <h3 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-2">Description</h3>
          <SourceLink
            value={<p className="text-sm text-ink-primary whitespace-pre-wrap">{detail.description}</p>}
            sources={detail.description_sources}
            data-testid="source-link-description"
          />
        </div>
      )}

      {analysisTimeout && (
        <div
          className="rounded-sm border border-l-4 border-l-warning border-border bg-surface p-4 flex items-center justify-between"
          data-testid="retry-banner"
        >
          <p className="text-sm text-ink-primary">Analysis timed out. Results may still be processing.</p>
          <Button variant="secondary" onClick={retryAnalysis} loading={analysisLoading}>
            Retry
          </Button>
        </div>
      )}

      {analysisLoading && !analysisTimeout && (
        <div className="flex flex-col gap-3">
          <Skeleton lines={2} />
          <Skeleton variant="rect" height={80} />
        </div>
      )}

      {detail.analysis && !analysisTimeout && <AnalysisSection detail={detail} />}

      <QualifyConfirmModal
        open={qualifyOpen}
        onClose={() => setQualifyOpen(false)}
        onConfirm={() => {
          qualifyMutation.mutate(detail.id, { onSuccess: () => setQualifyOpen(false) });
        }}
        title={detail.title}
        loading={qualifyMutation.isPending}
      />
    </div>
  );
}
