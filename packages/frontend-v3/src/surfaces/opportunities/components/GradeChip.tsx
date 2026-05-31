import type { SourceRef } from '../types';

interface GradeChipProps {
  grade: string;
  sources?: SourceRef[];
}

const gradeClasses: Record<string, string> = {
  A: 'bg-success/15 text-success',
  B: 'bg-warning/15 text-warning',
  C: 'bg-critical/15 text-critical',
};

export function GradeChip({ grade, sources }: GradeChipProps) {
  const cls = gradeClasses[grade.toUpperCase()] ?? 'bg-ink-dim/15 text-ink-muted';
  const sourceUrl = sources?.[0]?.url;

  const chip = (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-semibold ${cls}`}
      data-source-url={sourceUrl}
      data-testid="grade-chip"
    >
      {grade.toUpperCase()}
    </span>
  );

  if (sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" data-source-url={sourceUrl} data-testid="grade-chip">
        {chip}
      </a>
    );
  }

  return chip;
}
