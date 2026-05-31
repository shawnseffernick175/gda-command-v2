/**
 * Color review stage management.
 *
 * Stages: pink → red → gold → submitted (monotonic progression).
 * Matches DB CHECK constraint on captures.color_stage.
 * Skipping forward is allowed; regression requires explicit `force: true`.
 */

export const COLOR_REVIEW_STAGES = ['pink', 'red', 'gold', 'submitted'] as const;
export type ColorReviewStage = (typeof COLOR_REVIEW_STAGES)[number];

export function isValidStage(stage: string): stage is ColorReviewStage {
  return (COLOR_REVIEW_STAGES as readonly string[]).includes(stage);
}

function stageIndex(stage: ColorReviewStage): number {
  return COLOR_REVIEW_STAGES.indexOf(stage);
}

export interface StageTransitionResult {
  allowed: boolean;
  reason?: string;
}

export function validateStageTransition(
  current: ColorReviewStage,
  next: ColorReviewStage,
  force: boolean
): StageTransitionResult {
  const currentIdx = stageIndex(current);
  const nextIdx = stageIndex(next);

  if (nextIdx === currentIdx) {
    return { allowed: true };
  }

  if (nextIdx > currentIdx) {
    return { allowed: true };
  }

  if (force) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Cannot regress from '${current}' to '${next}' without force: true`,
  };
}
