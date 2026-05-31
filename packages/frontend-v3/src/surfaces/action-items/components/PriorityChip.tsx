const priorityClasses: Record<string, string> = {
  P0: 'bg-critical/15 text-critical',
  P1: 'bg-warning/15 text-warning',
  P2: 'bg-accent/15 text-accent',
  P3: 'bg-ink-dim/15 text-ink-dim',
};

interface PriorityChipProps {
  priority: string;
}

export function PriorityChip({ priority }: PriorityChipProps) {
  const cls = priorityClasses[priority] ?? 'bg-ink-dim/15 text-ink-dim';
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium ${cls}`}>
      {priority}
    </span>
  );
}
