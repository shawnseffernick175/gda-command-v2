import { useEffect, useRef } from 'react';

interface TimeoutBannerProps {
  onRetry: () => void;
  onCancel: () => void;
}

export function TimeoutBanner({ onRetry, onCancel }: TimeoutBannerProps) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-sm border-l-4 border-l-warning border border-border bg-white p-6"
      data-testid="timeout-banner"
    >
      <p className="text-sm font-medium text-ink-primary">
        Analysis is taking longer than 10 seconds.
      </p>
      <p className="text-sm text-ink-muted">
        The router is still processing in the background. Click Retry to poll for results.
      </p>
      <div className="flex items-center gap-2 mt-1">
        <button
          ref={retryRef}
          type="button"
          className="h-8 px-4 rounded-sm border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          onClick={onRetry}
        >
          Retry
        </button>
        <button
          type="button"
          className="h-8 px-4 rounded-sm border border-border bg-surface text-sm text-ink-primary font-medium hover:bg-canvas transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
