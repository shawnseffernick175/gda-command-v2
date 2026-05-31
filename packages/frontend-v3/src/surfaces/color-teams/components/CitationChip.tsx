import type { Citation } from '../types';

const gradeClasses: Record<string, string> = {
  A: 'bg-accent text-white',
  B: 'bg-surface-raised text-ink-primary border border-border',
  C: 'bg-surface-raised text-ink-muted border border-border',
};

interface CitationChipProps {
  citation: Citation;
}

export function CitationChip({ citation }: CitationChipProps) {
  const cls = gradeClasses[citation.grade] ?? gradeClasses['C'];

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-sm no-underline hover:opacity-80 transition-opacity duration-[var(--duration-state)] ${cls}`}
      title={citation.source}
    >
      [{citation.grade}]
    </a>
  );
}
