import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { ColorReviewChip } from './components/ColorReviewChip';
import { SourceLink } from './components/SourceLink';
import { AdvanceColorReviewModal } from './AdvanceColorReviewModal';
import { useAdvanceColorReview } from './hooks/useAdvanceColorReview';
import type { CaptureDetail, ColorReviewPhase } from './types';

const PHASE_ORDER: ColorReviewPhase[] = ['none', 'blue', 'pink', 'red', 'gold'];

interface CaptureColorReviewTabProps {
  capture: CaptureDetail;
}

export function CaptureColorReviewTab({ capture }: CaptureColorReviewTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const advance = useAdvanceColorReview(capture.id);

  const canAdvance = PHASE_ORDER.indexOf(capture.color_review_phase) < PHASE_ORDER.length - 1;

  const handleConfirm = () => {
    advance.mutate(undefined, {
      onSuccess: () => setModalOpen(false),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-ink-muted">Current Phase:</span>
        <ColorReviewChip phase={capture.color_review_phase} sourceUrl={capture.source_url} />
        {canAdvance && (
          <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
            Advance
          </Button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink-primary mb-3">Findings</h3>
        {capture.color_review_findings.length === 0 ? (
          <p className="text-sm text-ink-muted">No findings recorded.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Phase</th>
                <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Finding</th>
                <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Severity</th>
                <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Source</th>
              </tr>
            </thead>
            <tbody>
              {capture.color_review_findings.map((f) => (
                <tr key={f.id} className="border-b border-border h-10">
                  <td className="px-2 py-1.5">
                    <ColorReviewChip phase={f.phase} sourceUrl={f.source_url} />
                  </td>
                  <td className="px-2 py-1.5 text-sm text-ink-primary">{f.finding}</td>
                  <td className="px-2 py-1.5">
                    <span
                      data-source-url={f.source_url}
                      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-transparent ${
                        f.severity === 'critical' ? 'bg-critical/15 text-critical' :
                        f.severity === 'major' ? 'bg-warning/15 text-warning' :
                        'bg-surface-raised text-ink-muted'
                      }`}
                    >
                      <a href={f.source_url} target="_blank" rel="noopener noreferrer">{f.severity}</a>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <SourceLink sources={f.source_url_sources} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AdvanceColorReviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentPhase={capture.color_review_phase}
        onConfirm={handleConfirm}
        loading={advance.isPending}
      />
    </div>
  );
}
