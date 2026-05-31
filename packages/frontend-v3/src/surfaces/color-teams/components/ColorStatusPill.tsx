import type { RunStatus, ColorTeamColor } from '../types';

const statusLabels: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  complete: 'Complete',
  error: 'Error',
};

const statusClasses: Record<RunStatus, string> = {
  queued: 'border-border text-ink-muted',
  running: 'border-accent text-accent',
  complete: 'border-success text-success',
  error: 'border-critical text-critical',
};

const colorLabels: Record<ColorTeamColor, string> = {
  pink: 'Pink',
  red: 'Red',
  black: 'Black',
  blue: 'Blue',
  white: 'White',
  green: 'Green',
};

interface ColorStatusPillProps {
  color: ColorTeamColor;
  status: RunStatus;
  findingCount?: number | undefined;
}

export function ColorStatusPill({ color, status, findingCount }: ColorStatusPillProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border text-sm font-medium ${statusClasses[status]}`}
    >
      <span className="font-semibold">{colorLabels[color]}</span>
      <span className="text-xs">{statusLabels[status]}</span>
      {status === 'complete' && findingCount !== undefined && (
        <span className="text-xs text-ink-muted">({findingCount})</span>
      )}
      {status === 'running' && (
        <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
      )}
    </div>
  );
}
