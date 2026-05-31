import { Dialog } from '../../components/Dialog/Dialog';
import { Button } from '../../components/Button/Button';
import type { ColorReviewPhase } from './types';

const PHASE_ORDER: ColorReviewPhase[] = ['none', 'blue', 'pink', 'red', 'gold'];

function nextPhaseLabel(current: ColorReviewPhase): string {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return '';
  return PHASE_ORDER[idx + 1]!.charAt(0).toUpperCase() + PHASE_ORDER[idx + 1]!.slice(1);
}

interface AdvanceColorReviewModalProps {
  open: boolean;
  onClose: () => void;
  currentPhase: ColorReviewPhase;
  onConfirm: () => void;
  loading?: boolean;
}

export function AdvanceColorReviewModal({ open, onClose, currentPhase, onConfirm, loading }: AdvanceColorReviewModalProps) {
  const next = nextPhaseLabel(currentPhase);

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
        This will advance the color review from <strong>{currentPhase}</strong> to <strong>{next}</strong>.
        This action cannot be undone.
      </p>
    </Dialog>
  );
}
