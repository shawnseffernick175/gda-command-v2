/**
 * EvidenceBadge — inline badge for evidence grade A/B/C.
 * [A] green (accent), [B] amber, [C] red (critical).
 */

interface EvidenceBadgeProps {
  grade: 'A' | 'B' | 'C';
  label?: string;
}

const gradeStyles: Record<'A' | 'B' | 'C', string> = {
  A: 'border-accent text-accent',
  B: 'border-warning text-warning',
  C: 'border-critical text-critical',
};

const gradeLabels: Record<'A' | 'B' | 'C', string> = {
  A: 'Primary',
  B: 'Secondary',
  C: 'Hypothesis',
};

export function EvidenceBadge({ grade, label }: EvidenceBadgeProps) {
  return (
    <span
      className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold border ${gradeStyles[grade]}`}
      title={`Evidence Grade ${grade}: ${gradeLabels[grade]}`}
    >
      [{grade}]
      {label && <span className="ml-1 font-normal">{label}</span>}
    </span>
  );
}
