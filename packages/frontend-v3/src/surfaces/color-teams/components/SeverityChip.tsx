import type { FindingSeverity } from '../types';

const severityClasses: Record<FindingSeverity, string> = {
  info: 'border-border text-ink-muted',
  warning: 'border-warning text-warning',
  critical: 'border-critical text-critical',
  blocker: 'bg-critical text-white border-critical',
};

interface SeverityChipProps {
  severity: FindingSeverity;
}

export function SeverityChip({ severity }: SeverityChipProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-sm border uppercase tracking-wider ${severityClasses[severity]}`}
    >
      {severity}
    </span>
  );
}
