import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchAwards } from '../api';
import type { AwardListFilters } from '../types';

const DEFAULT_LIMIT = 50;

export function useAwardsList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: AwardListFilters = {
    agency: searchParams.get('agency') ?? undefined,
    contract_type: searchParams.get('contract_type') ?? undefined,
    awarded_after: searchParams.get('awarded_after') ?? undefined,
    awarded_before: searchParams.get('awarded_before') ?? undefined,
    limit: Number(searchParams.get('limit')) || DEFAULT_LIMIT,
    cursor: searchParams.get('cursor') ?? undefined,
  };

  const query = useQuery({
    queryKey: ['awards', filters],
    queryFn: () => fetchAwards(filters),
  });

  function setFilter(key: keyof AwardListFilters, value: string | undefined) {
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
