import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type { UnifiedOpportunityDetail } from '../types';

async function fetchUnifiedDetail(id: string): Promise<UnifiedOpportunityDetail> {
  return apiFetch<UnifiedOpportunityDetail>(`/v3/opportunities/unified/${id}`);
}

export function useUnifiedDetail(id: string) {
  const detail = useQuery({
    queryKey: ['unified', 'detail', id],
    queryFn: () => fetchUnifiedDetail(id),
    staleTime: 30_000,
  });

  return { detail };
}
