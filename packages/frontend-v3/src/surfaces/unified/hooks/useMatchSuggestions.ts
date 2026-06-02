import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../../lib/api-client';
import type {
  MatchSuggestionsResult,
  PendingConfidence,
  SuggestionAction,
  SuggestionDecisionResult,
} from '../types';

/**
 * F-422: data layer for the Review Matches queue.
 *
 * GET  /v3/match-suggestions  — list pending MEDIUM/LOW links (F-412)
 * POST /v3/match-suggestions  — { link_id, action } confirm/reject (F-412)
 *
 * The confidence filter is URL-synced (?confidence=MEDIUM|LOW) so a review
 * session is shareable and survives reload. A decision invalidates both the
 * suggestion queue and the unified list/detail caches, because confirming or
 * rejecting a link changes which source records feed the merged view.
 */

const DEFAULT_LIMIT = 50;
const PENDING_TIERS: PendingConfidence[] = ['MEDIUM', 'LOW'];

export interface SuggestionFilters {
  confidence: PendingConfidence | undefined;
  cursor: string | undefined;
  limit: number;
}

function buildPath(filters: SuggestionFilters): string {
  const params = new URLSearchParams();
  if (filters.confidence) params.set('confidence', filters.confidence);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `/v3/match-suggestions?${qs}` : '/v3/match-suggestions';
}

export function useMatchSuggestions(enabled: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawConfidence = (searchParams.get('confidence') ?? '').toUpperCase();
  const confidence: PendingConfidence | undefined = PENDING_TIERS.includes(
    rawConfidence as PendingConfidence,
  )
    ? (rawConfidence as PendingConfidence)
    : undefined;

  const filters: SuggestionFilters = {
    confidence,
    cursor: searchParams.get('s_cursor') ?? undefined,
    limit: Number(searchParams.get('limit')) || DEFAULT_LIMIT,
  };

  const query = useQuery({
    queryKey: ['match-suggestions', filters],
    queryFn: () => apiFetch<MatchSuggestionsResult>(buildPath(filters)),
    enabled,
    staleTime: 15_000,
  });

  function setConfidence(next: PendingConfidence | undefined) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (!next) sp.delete('confidence');
      else sp.set('confidence', next);
      sp.delete('s_cursor');
      return sp;
    });
  }

  function goToCursor(cursor: string | null) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (cursor) sp.set('s_cursor', cursor);
      else sp.delete('s_cursor');
      return sp;
    });
  }

  return {
    filters,
    confidence,
    items: query.data?.items ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading && enabled,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    setConfidence,
    goToCursor,
  };
}

/**
 * Confirm or reject a single suggestion. On success, invalidate the queue and
 * the unified caches so the decided link disappears from the queue and the
 * merged opportunity view refreshes.
 */
export function useDecideSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: { link_id: number; action: SuggestionAction }) =>
      apiFetch<SuggestionDecisionResult>('/v3/match-suggestions', {
        method: 'POST',
        body: JSON.stringify({ link_id: vars.link_id, action: vars.action }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['match-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['unified'] });
    },
  });
}
