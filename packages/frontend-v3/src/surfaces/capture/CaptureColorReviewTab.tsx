import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { ColorReviewChip } from './components/ColorReviewChip';
import { AdvanceColorReviewModal } from './AdvanceColorReviewModal';
import { useAdvanceColorReview } from './hooks/useAdvanceColorReview';
import type { CaptureDetail, ColorStage } from './types';

const STAGE_ORDER: ColorStage[] = ['pink', 'red', 'gold', 'submitted'];

interface CaptureColorReviewTabProps {
  capture: CaptureDetail;
}

export function CaptureColorReviewTab({ capture }: CaptureColorReviewTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const advance = useAdvanceColorReview(capture.id);

  const canAdvance = STAGE_ORDER.indexOf(capture.color_stage) < STAGE_ORDER.length - 1;

  const handleConfirm = () => {
    advance.mutate(undefined, {
      onSuccess: () => setModalOpen(false),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-ink-muted">Current Stage:</span>
        <ColorReviewChip phase={capture.color_stage} />
        {canAdvance && (
          <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
            Advance
          </Button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink-primary mb-3">Compliance Status</h3>
        <p className="text-sm text-ink-primary">{capture.compliance_status}</p>
      </div>

      <AdvanceColorReviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentStage={capture.color_stage}
        onConfirm={handleConfirm}
        loading={advance.isPending}
      />
    </div>
  );
}
