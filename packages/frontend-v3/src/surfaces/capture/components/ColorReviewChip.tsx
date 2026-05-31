import type { ColorReviewPhase } from '../types';

const phaseConfig: Record<ColorReviewPhase, { label: string; cls: string }> = {
  none: { label: 'None', cls: 'border-border bg-surface-raised text-ink-muted' },
  blue: { label: 'Blue', cls: 'border-transparent bg-accent/15 text-accent' },
  pink: { label: 'Pink', cls: 'border-transparent bg-critical/15 text-critical' },
  red: { label: 'Red', cls: 'border-transparent bg-critical/25 text-critical' },
  gold: { label: 'Gold', cls: 'border-transparent bg-warning/15 text-warning' },
};

interface ColorReviewChipProps {
  phase: ColorReviewPhase;
  sourceUrl: string;
}

export function ColorReviewChip({ phase, sourceUrl }: ColorReviewChipProps) {
  const config = phaseConfig[phase];
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-source-url={sourceUrl}
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border ${config.cls} hover:opacity-80 transition-opacity`}
    >
      {config.label}
    </a>
  );
}
