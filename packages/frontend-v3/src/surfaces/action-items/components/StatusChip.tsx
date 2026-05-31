import type { ActionItemStatus } from '../types';

const statusLabels: Record<ActionItemStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
};

const statusClasses: Record<ActionItemStatus, string> = {
  open: 'bg-accent/15 text-accent',
  in_progress: 'bg-warning/15 text-warning',
  done: 'bg-success/15 text-success',
};

interface StatusChipProps {
  status: ActionItemStatus;
}

export function StatusChip({ status }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium ${statusClasses[status]}`}
      data-testid="status-chip"
    >
      {statusLabels[status]}
    </span>
  );
}
