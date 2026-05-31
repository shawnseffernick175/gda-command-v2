import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { OpportunityDetail, SuccessEnvelope, ErrorEnvelope } from '../types';

async function fetchOpportunityDetail(id: string): Promise<OpportunityDetail> {
  const res = await fetch(`/v3/opportunities/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch opportunity: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<OpportunityDetail>;
  return envelope.data;
}

async function analyzeOpportunity(
  id: string,
): Promise<{ detail: OpportunityDetail | null; timeout: boolean }> {
  const res = await fetch(`/v3/opportunities/${id}`, { method: 'GET' });
  if (res.status === 503) {
    const err = (await res.json()) as ErrorEnvelope;
    if (err.error.code === 'ANALYSIS_TIMEOUT') {
      return { detail: null, timeout: true };
    }
  }
  if (!res.ok) {
    throw new Error(`Analysis request failed: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<OpportunityDetail>;
  return { detail: envelope.data, timeout: false };
}

export function useOpportunityDetail(id: string | undefined) {
  const queryClient = useQueryClient();
  const [analysisTimeout, setAnalysisTimeout] = useState(false);
  const firedRef = useRef<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => fetchOpportunityDetail(id!),
    enabled: !!id,
  });

  const analysisMutation = useMutation({
    mutationFn: (oppId: string) => analyzeOpportunity(oppId),
    onSuccess: (result) => {
      if (result.timeout) {
        setAnalysisTimeout(true);
      } else if (result.detail) {
        setAnalysisTimeout(false);
        queryClient.setQueryData(['opportunity', id], result.detail);
      }
    },
  });

  const triggerAnalysis = useCallback(() => {
    if (!id) return;
    setAnalysisTimeout(false);
    analysisMutation.mutate(id);
  }, [id, analysisMutation]);

  // Auto-fire analysis on mount exactly once per id
  useEffect(() => {
    if (id && firedRef.current !== id) {
      firedRef.current = id;
      setAnalysisTimeout(false);
      analysisMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return {
    detail: detailQuery.data ?? null,
    isLoading: detailQuery.isLoading,
    isError: detailQuery.isError,
    error: detailQuery.error,
    analysisTimeout,
    analysisLoading: analysisMutation.isPending,
    retryAnalysis: triggerAnalysis,
  };
}
