interface PwinChipProps {
  pwin: number;
  sourceUrl?: string | undefined;
}

function level(pwin: number): string {
  if (pwin >= 70) return 'bg-success/15 text-success';
  if (pwin >= 40) return 'bg-warning/15 text-warning';
  return 'bg-critical/15 text-critical';
}

export function PwinChip({ pwin, sourceUrl }: PwinChipProps) {
  const chip = (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium ${level(pwin)}`}
      data-testid="pwin-chip"
      data-source-url={sourceUrl}
    >
      {pwin}% Pwin
    </span>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-source-url={sourceUrl}
        className="inline-flex"
      >
        {chip}
      </a>
    );
  }

  return chip;
}
