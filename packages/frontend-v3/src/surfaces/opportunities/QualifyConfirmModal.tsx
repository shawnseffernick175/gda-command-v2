import { Dialog } from '../../components/Dialog/Dialog';
import { Button } from '../../components/Button/Button';

interface QualifyConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  loading?: boolean;
}

export function QualifyConfirmModal({ open, onClose, onConfirm, title, loading }: QualifyConfirmModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Qualify Opportunity"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading ?? false}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading ?? false}>
            Confirm Qualify
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-primary">
        Move <span className="font-medium">{title}</span> into the qualified pipeline?
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        Per Sentinel rules, nothing enters the pipeline without explicit qualification.
      </p>
    </Dialog>
  );
}
