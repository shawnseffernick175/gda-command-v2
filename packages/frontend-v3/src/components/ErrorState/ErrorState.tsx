import type { ErrorStateProps } from '../../types';
import { Button } from '../Button/Button';

export function ErrorState({ title = 'Something went wrong', description, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-md border border-border border-l-4 border-l-critical bg-surface p-6">
      <h3 className="text-md font-medium text-ink-primary">{title}</h3>
      {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </div>
  );
}
