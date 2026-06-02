import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type { UnifiedOpportunityDetail } from '../types';

async function fetchUnifiedDetail(id: string): Promise<UnifiedOpportunityDetail> {
  return apiFetch<UnifiedOpportunityDetail>(`/v3/opportunities/unified/${id}`);
}

/**
 * R2 (F-420a): trigger analysis for the unified opportunity. The endpoint
 * enqueues analysis on the underlying primary-source opportunity, waits for it
 * to settle, and returns the refreshed unified detail. Returns the detail
 * unchanged when no analyzable source exists.
 */
async function analyzeUnified(id: string): Promise<UnifiedOpportunityDetail> {
  return apiFetch<UnifiedOpportunityDetail>(
    `/v3/opportunities/unified/${id}/analyze`,
    { method: 'POST' },
  );
}

export function useUnifiedDetail(id: string) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['unified', 'detail', id],
    queryFn: () => fetchUnifiedDetail(id),
    staleTime: 30_000,
  });

  // R2: auto-trigger analysis once per mount, after the detail loads, writing
  // the refreshed detail straight into the query cache. Failures (e.g. 503
  // timeout, or no analyzable source) are swallowed — the page still renders
  // the cached detail.
  const analysis = useMutation({
    mutationFn: () => analyzeUnified(id),
    onSuccess: (refreshed) => {
      queryClient.setQueryData(['unified', 'detail', id], refreshed);
    },
  });

  const analyzeRef = useRef(analysis.mutate);
  analyzeRef.current = analysis.mutate;
  const triggeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!detail.isSuccess) return;
    if (triggeredFor.current === id) return;
    triggeredFor.current = id;
    analyzeRef.current();
  }, [detail.isSuccess, id]);

  return { detail, analysis };
}
