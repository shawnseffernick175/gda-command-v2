import { Dialog } from '../../components/Dialog/Dialog';
import { Button } from '../../components/Button/Button';
import type { ColorStage } from './types';

const STAGE_ORDER: ColorStage[] = ['pink', 'red', 'gold', 'submitted'];

function nextStageLabel(current: ColorStage): string {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return '';
  const next = STAGE_ORDER[idx + 1]!;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

interface AdvanceColorReviewModalProps {
  open: boolean;
  onClose: () => void;
  currentStage: ColorStage;
  onConfirm: () => void;
  loading?: boolean;
}

export function AdvanceColorReviewModal({ open, onClose, currentStage, onConfirm, loading }: AdvanceColorReviewModalProps) {
  const next = nextStageLabel(currentStage);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Advance Color Review"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} loading={loading ?? false}>
            Advance to {next}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-primary">
        This will advance the color review from <strong>{currentStage}</strong> to <strong>{next}</strong>.
        This action cannot be undone.
      </p>
    </Dialog>
  );
}
