import type { ToastProps } from '../../types';

const severityBarColor: Record<string, string> = {
  info: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-critical',
};

export function Toast({ severity, message, action, dismissible = true, duration: _duration }: ToastProps & { onDismiss?: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border bg-surface-raised max-w-sm overflow-hidden"
      role={severity === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className={`w-1 self-stretch ${severityBarColor[severity]}`} />
      <p className="flex-1 text-sm text-ink-primary py-3">{message}</p>
      {action && (
        <button type="button" className="text-xs text-accent font-medium px-2 hover:text-accent-hover" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {dismissible && (
        <button type="button" className="text-ink-muted hover:text-ink-primary pr-3 text-sm" aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  );
}
