import type { ColorStage } from '../types';

const stageConfig: Record<ColorStage, { label: string; className: string }> = {
  pink: { label: 'Pink', className: 'bg-pink-100 text-pink-800 border-pink-300' },
  red: { label: 'Red', className: 'bg-red-100 text-red-800 border-red-300' },
  gold: { label: 'Gold', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  submitted: { label: 'Submitted', className: 'bg-green-100 text-green-800 border-green-300' },
};

interface ColorReviewChipProps {
  phase: ColorStage;
  sourceUrl?: string;
}

export function ColorReviewChip({ phase, sourceUrl }: ColorReviewChipProps) {
  const cfg = stageConfig[phase] ?? { label: phase, className: 'bg-surface-raised text-ink-muted' };

  const chip = (
    <span
      data-source-url={sourceUrl}
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );

  if (sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
        {chip}
      </a>
    );
  }

  return chip;
}
