import type { PipelineStage } from '../types';
import { STAGE_LABELS } from '../types';

const stageClasses: Record<PipelineStage, string> = {
  identified: 'bg-ink-dim/15 text-ink-dim',
  qualified: 'bg-accent/15 text-accent',
  capture: 'bg-accent/15 text-accent',
  proposal: 'bg-warning/15 text-warning',
  submitted: 'bg-warning/15 text-warning',
  awarded: 'bg-success/15 text-success',
  lost: 'bg-critical/15 text-critical',
  'no-bid': 'bg-ink-dim/15 text-ink-dim',
};

interface StageChipProps {
  stage: PipelineStage;
}

export function StageChip({ stage }: StageChipProps) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium ${stageClasses[stage]}`}
      data-testid="stage-chip"
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
