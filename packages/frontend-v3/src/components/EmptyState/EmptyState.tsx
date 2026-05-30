import type { EmptyStateProps } from '../../types';
import { Button } from '../Button/Button';

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] py-12 text-center">
      <h3 className="text-md font-medium text-ink-primary">{title}</h3>
      {description && <p className="mt-2 text-sm text-ink-muted max-w-sm">{description}</p>}
      {action && (
        <div className="mt-4">
          <Button variant="secondary" onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}
