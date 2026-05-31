import { Dialog } from '../../components/Dialog/Dialog';
import { Button } from '../../components/Button/Button';
import type { PipelineStage } from './types';
import { STAGE_LABELS } from './types';

interface TerminalStageConfirmModalProps {
  open: boolean;
  stage: PipelineStage | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TerminalStageConfirmModal({
  open,
  stage,
  onConfirm,
  onCancel,
}: TerminalStageConfirmModalProps) {
  const label = stage ? STAGE_LABELS[stage] : '';

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={`Move to ${label}?`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Confirm
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-primary">
        Moving this item to <strong>{label}</strong> is a terminal stage change.
        This action marks the pursuit as final.
      </p>
    </Dialog>
  );
}
