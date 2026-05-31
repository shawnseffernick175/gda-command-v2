import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs } from '../../components/Tabs/Tabs';
import { Button } from '../../components/Button/Button';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { PwinChip } from './components/PwinChip';
import { ColorReviewChip } from './components/ColorReviewChip';
import { useCaptureDetail } from './hooks/useCaptureDetail';
import { CaptureColorReviewTab } from './CaptureColorReviewTab';
import { CaptureComplianceTab } from './CaptureComplianceTab';
import { CapturePricingTab } from './CapturePricingTab';
import { CaptureTeamingTab } from './CaptureTeamingTab';

const TAB_ITEMS = [
  { id: 'color-review', label: 'Color Review' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'teaming', label: 'Teaming' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
}

export function CaptureDetail() {
  const { opp_id } = useParams<{ opp_id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('color-review');

  const { detail, analysis, analysisTimeout, retryAnalysis } = useCaptureDetail(opp_id!);

  if (detail.isLoading) {
    return <div className="p-6 text-sm text-ink-muted">Loading capture...</div>;
  }

  if (detail.isError) {
    return (
      <div className="py-6">
        <ErrorState
          title="Failed to load capture"
          description={detail.error instanceof Error ? detail.error.message : 'Unknown error'}
          onRetry={detail.refetch}
        />
      </div>
    );
  }

  const capture = detail.data;
  if (!capture) return null;

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => navigate('/capture')}>
          &larr; Back
        </Button>
        <h1 className="text-xl font-semibold text-ink-primary">{capture.opportunity_title}</h1>
      </div>

      {analysisTimeout && (
        <div
          className="rounded-sm border border-border border-l-4 border-l-warning bg-surface p-4 flex items-center justify-between"
          role="alert"
          data-testid="analysis-timeout-banner"
        >
          <span className="text-sm text-ink-primary">Analysis timed out. Results may be stale.</span>
          <Button variant="secondary" size="sm" onClick={retryAnalysis} loading={analysis.isPending}>
            Retry
          </Button>
        </div>
      )}

      {analysis.isPending && (
        <div className="text-sm text-ink-muted" data-testid="analysis-loading">
          Analyzing...
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Agency</span>
          <span className="text-sm text-ink-primary">{capture.opportunity_agency ?? '\u2014'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Response Date</span>
          <span className="text-sm text-ink-primary">{formatDate(capture.created_at)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Pwin</span>
          {capture.pwin !== null
            ? <PwinChip pwin={capture.pwin} sourceUrl={capture.pwin_sources?.[0]?.url ?? capture.source_url ?? '#'} />
            : <span className="text-sm text-ink-muted">—</span>
          }
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Color Review</span>
          <ColorReviewChip phase={capture.color_stage} />
        </div>
      </div>

      <Tabs items={TAB_ITEMS} activeId={activeTab} onChange={setActiveTab} />

      <div role="tabpanel">
        {activeTab === 'color-review' && <CaptureColorReviewTab capture={capture} />}
        {activeTab === 'compliance' && <CaptureComplianceTab capture={capture} />}
        {activeTab === 'pricing' && <CapturePricingTab capture={capture} />}
        {activeTab === 'teaming' && <CaptureTeamingTab capture={capture} />}
      </div>
    </div>
  );
}
