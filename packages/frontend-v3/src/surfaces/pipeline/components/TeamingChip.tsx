import type { TeamingRole } from '../types';
import { TEAMING_LABELS } from '../types';

interface TeamingChipProps {
  teaming: TeamingRole;
}

export function TeamingChip({ teaming }: TeamingChipProps) {
  return (
    <span
      className="inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-border bg-surface-raised text-ink-primary"
      data-testid="teaming-chip"
    >
      {TEAMING_LABELS[teaming]}
    </span>
  );
}
