const sourceLabels: Record<string, string> = {
  email: 'Email',
  capture: 'Capture',
  pipeline: 'Pipeline',
  opportunity: 'Opportunity',
  system: 'System',
  manual: 'Manual',
  sentinel: 'Sentinel',
  n8n: 'n8n Cron',
};

interface SourceChipProps {
  source: string;
}

export function SourceChip({ source }: SourceChipProps) {
  const label = sourceLabels[source] ?? source;
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-border bg-surface-raised text-ink-primary">
      {label}
    </span>
  );
}
