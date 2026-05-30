import type { StageIndicatorProps } from '../../types';

const stageLabels: Record<number, string> = {
  0: 'Long Term Positioning',
  1: 'Opportunity Assessment',
  2: 'Capture Planning',
  3: 'Proposal Planning',
  4: 'Proposal Development',
  5: 'Post-Submittal',
  6: 'Post-Award',
};

const stageColorClasses: Record<number, string> = {
  0: 'bg-stage-0',
  1: 'bg-stage-1',
  2: 'bg-stage-2',
  3: 'bg-stage-3',
  4: 'bg-stage-4',
  5: 'bg-stage-5',
  6: 'bg-stage-6',
};

export function StageIndicator({ stage, label, showLabel = true }: StageIndicatorProps) {
  const displayLabel = label ?? stageLabels[stage];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${stageColorClasses[stage]}`} />
      {showLabel && <span className="text-sm text-ink-primary">Stage {stage}: {displayLabel}</span>}
    </span>
  );
}
