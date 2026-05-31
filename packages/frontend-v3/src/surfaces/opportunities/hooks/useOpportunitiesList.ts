import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { ListFilters, OpportunitySummary, PaginatedResult, SuccessEnvelope } from '../types';

const API_BASE = '/v3/opportunities';

function buildQueryString(filters: ListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.agency) params.set('agency', filters.agency);
  if (filters.naics) params.set('naics', filters.naics);
  if (filters.grade) params.set('grade', filters.grade);
  if (filters.due_before) params.set('due_before', filters.due_before);
  if (filters.due_after) params.set('due_after', filters.due_after);
  if (filters.set_aside) params.set('set_aside', filters.set_aside);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.sort) params.set('sort', filters.sort);
  return params.toString();
}

async function fetchOpportunities(
  filters: ListFilters,
): Promise<PaginatedResult<OpportunitySummary>> {
  const qs = buildQueryString(filters);
  const url = qs ? `${API_BASE}?${qs}` : API_BASE;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch opportunities: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<PaginatedResult<OpportunitySummary>>;
  return envelope.data;
}

const DEFAULT_LIMIT = 25;

export function useOpportunitiesList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: ListFilters = {
    status: searchParams.get('status') ?? undefined,
    agency: searchParams.get('agency') ?? undefined,
    naics: searchParams.get('naics') ?? undefined,
    grade: searchParams.get('grade') ?? undefined,
    due_before: searchParams.get('due_before') ?? undefined,
    due_after: searchParams.get('due_after') ?? undefined,
    set_aside: searchParams.get('set_aside') ?? undefined,
    limit: Number(searchParams.get('limit')) || DEFAULT_LIMIT,
    cursor: searchParams.get('cursor') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  };

  const query = useQuery({
    queryKey: ['opportunities', filters],
    queryFn: () => fetchOpportunities(filters),
  });

  function setFilter(key: keyof ListFilters, value: string | undefined) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      next.delete('cursor');
      return next;
    });
  }

  function setSort(column: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const currentSort = prev.get('sort');
      if (currentSort === column) {
        next.set('sort', `-${column}`);
      } else if (currentSort === `-${column}`) {
        next.delete('sort');
      } else {
        next.set('sort', column);
      }
      next.delete('cursor');
      return next;
    });
  }

  function goToPage(cursor: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cursor) {
        next.set('cursor', cursor);
      } else {
        next.delete('cursor');
      }
      return next;
    });
  }

  const sortKey = filters.sort?.replace(/^-/, '') ?? undefined;
  const sortDir: 'asc' | 'desc' | undefined = filters.sort
    ? filters.sort.startsWith('-')
      ? 'desc'
      : 'asc'
    : undefined;

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    filters,
    setFilter,
    setSort,
    goToPage,
    sortKey,
    sortDir,
  };
}
