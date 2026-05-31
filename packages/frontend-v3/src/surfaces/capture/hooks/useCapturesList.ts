import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type { CaptureListResponse } from '../types';

interface UseCapturesListParams {
  limit: number;
  offset: number;
  sort: string;
  sortDir: 'asc' | 'desc';
  filter: string;
}

async function fetchCaptures(params: UseCapturesListParams): Promise<CaptureListResponse['data']> {
  const qs = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
    sort: `${params.sort}:${params.sortDir}`,
    ...(params.filter ? { filter: params.filter } : {}),
  });
  return apiFetch<CaptureListResponse['data']>(`/v3/captures?${qs.toString()}`);
}

export function useCapturesList(params: UseCapturesListParams) {
  return useQuery({
    queryKey: ['captures', 'list', params],
    queryFn: () => fetchCaptures(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
