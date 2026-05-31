import { useState } from 'react';
import type { PipelineStage } from './types';
import { PIPELINE_STAGES, STAGE_LABELS, TERMINAL_STAGES } from './types';
import { TerminalStageConfirmModal } from './TerminalStageConfirmModal';

interface StageSelectorProps {
  currentStage: PipelineStage;
  onAdvance: (stage: PipelineStage) => void;
  disabled?: boolean | undefined;
}

export function StageSelector({
  currentStage,
  onAdvance,
  disabled = false,
}: StageSelectorProps) {
  const [pendingStage, setPendingStage] = useState<PipelineStage | null>(null);

  const handleChange = (stage: PipelineStage) => {
    if (stage === currentStage) return;
    if (TERMINAL_STAGES.includes(stage)) {
      setPendingStage(stage);
    } else {
      onAdvance(stage);
    }
  };

  return (
    <>
      <div className="relative flex flex-col gap-1">
        <select
          value={currentStage}
          onChange={(e) => handleChange(e.target.value as PipelineStage)}
          disabled={disabled}
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary hover:border-border-strong transition-colors disabled:opacity-40"
          aria-label="Pipeline stage"
          data-testid="stage-selector"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <TerminalStageConfirmModal
        open={pendingStage !== null}
        stage={pendingStage}
        onConfirm={() => {
          if (pendingStage) onAdvance(pendingStage);
          setPendingStage(null);
        }}
        onCancel={() => setPendingStage(null)}
      />
    </>
  );
}
