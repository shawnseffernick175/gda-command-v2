import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchRegulatoryNotices } from '../api';
import type { RegulatoryListFilters } from '../types';

const DEFAULT_LIMIT = 50;

export function useRegulatoryList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: RegulatoryListFilters = {
    agency: searchParams.get('agency') ?? undefined,
    published_after: searchParams.get('published_after') ?? undefined,
    published_before: searchParams.get('published_before') ?? undefined,
    limit: Number(searchParams.get('limit')) || DEFAULT_LIMIT,
    cursor: searchParams.get('cursor') ?? undefined,
  };

  const query = useQuery({
    queryKey: ['regulatory-notices', filters],
    queryFn: () => fetchRegulatoryNotices(filters),
  });

  function setFilter(key: keyof RegulatoryListFilters, value: string | undefined) {
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

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    filters,
    setFilter,
    goToPage,
  };
}
