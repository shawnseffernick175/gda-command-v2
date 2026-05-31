interface StatusChipProps {
  status: string;
}

const statusClasses: Record<string, string> = {
  qualified: 'bg-accent/15 text-accent border-accent/30',
  watching: 'bg-warning/15 text-warning border-warning/30',
  skipped: 'bg-ink-dim/15 text-ink-muted border-border',
  unscored: 'bg-ink-dim/10 text-ink-dim border-border',
  new: 'bg-ink-dim/10 text-ink-dim border-border',
};

export function StatusChip({ status }: StatusChipProps) {
  const cls = statusClasses[status] ?? 'bg-ink-dim/10 text-ink-dim border-border';
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border ${cls}`}
      data-testid="status-chip"
    >
      {status}
    </span>
  );
}
