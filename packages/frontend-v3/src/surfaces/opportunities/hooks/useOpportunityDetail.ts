import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import type { OpportunityDetail, SuccessEnvelope, ErrorEnvelope } from '../types';

const AUTO_RETRY_INTERVAL_MS = 5_000;

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
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        if (retryTimerRef.current) {
          clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        queryClient.setQueryData(['opportunity', id], result.detail);
      }
    },
  });

  // Auto-fire analysis on mount exactly once per id
  useEffect(() => {
    if (id && firedRef.current !== id) {
      firedRef.current = id;
      setAnalysisTimeout(false);
      analysisMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // R2: auto-retry silently on timeout (no manual button)
  useEffect(() => {
    if (analysisTimeout && id) {
      retryTimerRef.current = setInterval(() => {
        analysisMutation.mutate(id);
      }, AUTO_RETRY_INTERVAL_MS);
    }
    return () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisTimeout, id]);

  return {
    detail: detailQuery.data ?? null,
    isLoading: detailQuery.isLoading,
    isError: detailQuery.isError,
    error: detailQuery.error,
    analysisTimeout,
    analysisLoading: analysisMutation.isPending,
  };
}
