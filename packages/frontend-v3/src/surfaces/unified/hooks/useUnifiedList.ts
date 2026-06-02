import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../../lib/api-client';
import type { UnifiedListItem, UnifiedListResult, UnifiedTabId } from '../types';

/**
 * F-421 tab definitions. Each tab is a filter on the same
 * GET /v3/opportunities/unified endpoint via the `stage` query param.
 * `stage: undefined` means no filter (the "All" master view). The
 * Review Matches tab routes to the (future) F-422 suggestion queue and
 * carries no stage filter — it is rendered disabled until F-422 ships.
 */
export interface UnifiedTabDef {
  id: UnifiedTabId;
  label: string;
  /** Stage-group token sent as `?stage=`. undefined = no filter (All). */
  stage: string | undefined;
  /** True when the tab is a real list slice. Review Matches is not (F-422). */
  isList: boolean;
}

export const UNIFIED_TABS: UnifiedTabDef[] = [
  { id: 'all', label: 'All Opportunities', stage: undefined, isList: true },
  { id: 'active', label: 'Active', stage: 'active', isList: true },
  { id: 'pipeline', label: 'Pipeline', stage: 'pipeline', isList: true },
  { id: 'fast_track', label: 'Fast Track', stage: 'fast_track', isList: true },
  { id: 'awarded', label: 'Awarded', stage: 'awarded', isList: true },
  { id: 'review', label: 'Review Matches', stage: undefined, isList: false },
];

const DEFAULT_LIMIT = 50;

export interface UnifiedListFilters {
  tab: UnifiedTabId;
  agency: string | undefined;
  naics: string | undefined;
  cursor: string | undefined;
  limit: number;
}

function tabDef(tab: UnifiedTabId): UnifiedTabDef {
  return UNIFIED_TABS.find((t) => t.id === tab) ?? UNIFIED_TABS[0]!;
}

function buildPath(filters: UnifiedListFilters): string {
  const params = new URLSearchParams();
  const def = tabDef(filters.tab);
  if (def.stage) params.set('stage', def.stage);
  if (filters.agency) params.set('agency', filters.agency);
  if (filters.naics) params.set('naics', filters.naics);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `/v3/opportunities/unified?${qs}` : '/v3/opportunities/unified';
}

async function fetchUnifiedList(
  filters: UnifiedListFilters,
): Promise<UnifiedListResult> {
  return apiFetch<UnifiedListResult>(buildPath(filters));
}

export function useUnifiedList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab') ?? 'all';
  const tab: UnifiedTabId = (UNIFIED_TABS.some((t) => t.id === rawTab)
    ? rawTab
    : 'all') as UnifiedTabId;

  const filters: UnifiedListFilters = {
    tab,
    agency: searchParams.get('agency') ?? undefined,
    naics: searchParams.get('naics') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    limit: Number(searchParams.get('limit')) || DEFAULT_LIMIT,
  };

  const def = tabDef(tab);

  const query = useQuery({
    queryKey: ['unified', 'list', filters],
    queryFn: () => fetchUnifiedList(filters),
    // Review Matches has no list endpoint yet (F-422); skip the fetch.
    enabled: def.isList,
    staleTime: 30_000,
  });

  function setTab(next: UnifiedTabId) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (next === 'all') sp.delete('tab');
      else sp.set('tab', next);
      sp.delete('cursor');
      return sp;
    });
  }

  function setFilter(key: 'agency' | 'naics', value: string | undefined) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (!value) sp.delete(key);
      else sp.set(key, value);
      sp.delete('cursor');
      return sp;
    });
  }

  function goToCursor(cursor: string | null) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (cursor) sp.set('cursor', cursor);
      else sp.delete('cursor');
      return sp;
    });
  }

  const items: UnifiedListItem[] = query.data?.items ?? [];

  return {
    tab,
    isListTab: def.isList,
    filters,
    items,
    pagination: query.data?.pagination,
    isLoading: query.isLoading && def.isList,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    setTab,
    setFilter,
    goToCursor,
  };
}
