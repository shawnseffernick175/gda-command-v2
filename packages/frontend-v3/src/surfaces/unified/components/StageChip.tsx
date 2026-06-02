/**
 * F-421: lifecycle stage chip for the unified opportunities list.
 *
 * Color intent follows the architecture color lock (6 tokens only, no gold):
 *  - signal     → critical (early, attention-grabbing)
 *  - forecast   → accent   (calm, planning)
 *  - pre_sol    → warning  (action approaching)
 *  - solicitation → critical (act now)
 *  - awarded / post_award → ink (closed loop)
 *  - closed     → ink-dim  (done)
 * Falls back to a neutral ink treatment for unknown stages.
 */
interface StageChipProps {
  stage: string;
}

const STAGE_LABELS: Record<string, string> = {
  signal: 'Signal',
  forecast: 'Forecast',
  pre_sol: 'Pre-Sol',
  solicitation: 'Solicitation',
  awarded: 'Awarded',
  post_award: 'Post-Award',
  closed: 'Closed',
};

const STAGE_CLASSES: Record<string, string> = {
  signal: 'bg-critical/15 text-critical border-critical/30',
  forecast: 'bg-accent/15 text-accent border-accent/30',
  pre_sol: 'bg-warning/15 text-warning border-warning/30',
  solicitation: 'bg-critical/15 text-critical border-critical/40',
  awarded: 'bg-ink-dim/15 text-ink-primary border-border',
  post_award: 'bg-ink-dim/15 text-ink-primary border-border',
  closed: 'bg-ink-dim/10 text-ink-dim border-border',
};

export function StageChip({ stage }: StageChipProps) {
  const label = STAGE_LABELS[stage] ?? stage;
  const cls = STAGE_CLASSES[stage] ?? 'bg-ink-dim/10 text-ink-dim border-border';
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border ${cls}`}
      data-testid="stage-chip"
      data-stage={stage}
    >
      {label}
    </span>
  );
}
