import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { SuggestionCard } from './components/SuggestionCard';
import { useMatchSuggestions, useDecideSuggestion } from './hooks/useMatchSuggestions';
import type { PendingConfidence, SuggestionAction } from './types';

/**
 * F-422: the Review Matches queue.
 *
 * Renders pending cross-source match suggestions (MEDIUM/LOW links) and lets a
 * reviewer confirm or reject each one. Confirming/rejecting fires
 * POST /v3/match-suggestions and, on success, removes the card from the live
 * queue (we keep a local "decided" map so the card shows a resolved state for
 * a beat before the refetched list drops it).
 *
 * `active` gates the data fetch so the queue only loads when its tab is open.
 */

const TIER_FILTERS: Array<{ id: PendingConfidence | 'all'; label: string }> = [
  { id: 'all', label: 'All pending' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
];

export function ReviewMatches({ active }: { active: boolean }) {
  const {
    items,
    pagination,
    confidence,
    isLoading,
    isError,
    error,
    refetch,
    setConfidence,
    goToCursor,
    filters,
  } = useMatchSuggestions(active);

  const decide = useDecideSuggestion();

  // link_id -> the action it was decided as (for the resolved-state flash).
  const [decided, setDecided] = useState<Record<number, SuggestionAction>>({});
  // link_id currently in flight.
  const [pendingId, setPendingId] = useState<number | null>(null);

  function handleDecide(linkId: number, action: SuggestionAction) {
    setPendingId(linkId);
    decide.mutate(
      { link_id: linkId, action },
      {
        onSuccess: () => {
          setDecided((prev) => ({ ...prev, [linkId]: action }));
          setPendingId(null);
        },
        onError: () => {
          setPendingId(null);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="review-matches">
      <div className="flex items-center justify-between">
        <div className="flex gap-2" role="tablist" aria-label="Confidence filter">
          {TIER_FILTERS.map((t) => {
            const isActive =
              t.id === 'all' ? confidence === undefined : confidence === t.id;
            return (
              <Button
                key={t.id}
                variant={isActive ? 'primary' : 'secondary'}
                size="sm"
                onClick={() =>
                  setConfidence(t.id === 'all' ? undefined : (t.id as PendingConfidence))
                }
              >
                {t.label}
              </Button>
            );
          })}
        </div>
        {!isLoading && !isError && (
          <span className="text-sm text-ink-muted" data-testid="review-count">
            <span className="text-ink-primary font-semibold" data-numeric>
              {items.length}
            </span>
            {pagination?.hasMore ? '+ ' : ' '}
            pending
          </span>
        )}
      </div>

      {isError && (
        <ErrorState
          title="Failed to load match suggestions"
          {...(error?.message ? { description: error.message } : {})}
          onRetry={() => void refetch()}
        />
      )}

      {!isError && isLoading && (
        <div className="flex flex-col gap-3" data-testid="review-loading">
          <Skeleton variant="rect" width="100%" height={128} />
          <Skeleton variant="rect" width="100%" height={128} />
        </div>
      )}

      {!isError && !isLoading && items.length === 0 && (
        <EmptyState
          title="Nothing to review"
          description="No pending cross-source match suggestions. New MEDIUM/LOW matches will appear here for confirmation."
        />
      )}

      {!isError && !isLoading && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((s) => (
            <SuggestionCard
              key={s.link_id}
              suggestion={s}
              onDecide={handleDecide}
              isDeciding={pendingId === s.link_id}
              {...(decided[s.link_id] ? { decidedAs: decided[s.link_id] } : {})}
            />
          ))}
        </div>
      )}

      {pagination && items.length > 0 && (
        <div
          className="flex items-center justify-between border-t border-border pt-4"
          data-testid="review-pagination"
        >
          <span className="text-xs text-ink-muted">
            Showing {items.length}
            {pagination.hasMore ? ' of more' : ''}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!filters.cursor}
              onClick={() => goToCursor(null)}
            >
              First
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => goToCursor(pagination.cursor)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
