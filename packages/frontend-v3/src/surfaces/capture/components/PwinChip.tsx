interface PwinChipProps {
  pwin: number;
  sourceUrl?: string;
}

function getLevel(pwin: number): string {
  if (pwin >= 0.6) return 'bg-success/15 text-success';
  if (pwin >= 0.3) return 'bg-warning/15 text-warning';
  return 'bg-critical/15 text-critical';
}

export function PwinChip({ pwin, sourceUrl }: PwinChipProps) {
  return (
    <a
      href={sourceUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      data-source-url={sourceUrl ?? '#'}
      data-testid="data-point-pwin"
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-transparent ${getLevel(pwin)} hover:opacity-80 transition-opacity`}
    >
      {Math.round(pwin * 100)}%
    </a>
  );
}
