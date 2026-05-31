import { Dialog, Button } from '../../components';
import type { ActionItemStatus } from './types';

interface TerminalStatusConfirmModalProps {
  open: boolean;
  targetStatus: ActionItemStatus | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const labels: Partial<Record<ActionItemStatus, string>> = {
  done: 'Mark as Done',
};

export function TerminalStatusConfirmModal({
  open,
  targetStatus,
  onConfirm,
  onCancel,
  loading = false,
}: TerminalStatusConfirmModalProps) {
  const label = targetStatus ? (labels[targetStatus] ?? `Set ${targetStatus}`) : '';

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Confirm Status Change"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>{label}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-primary">
        Are you sure you want to mark this action item as <strong>{targetStatus}</strong>? This cannot be easily undone.
      </p>
    </Dialog>
  );
}
