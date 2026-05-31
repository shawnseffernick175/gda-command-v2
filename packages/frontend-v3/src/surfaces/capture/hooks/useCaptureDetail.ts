import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { apiFetch, ApiError } from '../../../lib/api-client';
import type { CaptureDetail, AnalysisResult } from '../types';

async function fetchCapture(id: string): Promise<CaptureDetail> {
  return apiFetch<CaptureDetail>(`/v3/captures/${id}`);
}

async function analyzeCapture(id: string): Promise<AnalysisResult> {
  return apiFetch<AnalysisResult>(`/v3/captures/${id}/analyze`, { method: 'POST' });
}

export function useCaptureDetail(id: string) {
  const queryClient = useQueryClient();
  const [analysisTimeout, setAnalysisTimeout] = useState(false);

  const detail = useQuery({
    queryKey: ['captures', 'detail', id],
    queryFn: () => fetchCapture(id),
    staleTime: 30_000,
  });

  const analysis = useMutation({
    mutationFn: () => analyzeCapture(id),
    onSuccess: (result) => {
      setAnalysisTimeout(false);
      queryClient.setQueryData<CaptureDetail>(['captures', 'detail', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          pwin: result.pwin,
          pwin_sources: result.pwin_sources,
          color_stage: result.color_stage,
          compliance_coverage: result.compliance_coverage,
          compliance_sources: result.compliance_sources,
        };
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 503 && err.code === 'ANALYSIS_TIMEOUT') {
        setAnalysisTimeout(true);
      }
    },
  });

  useEffect(() => {
    if (detail.data && !analysis.isPending && !analysis.isSuccess) {
      analysis.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.id]);

  const retryAnalysis = () => {
    setAnalysisTimeout(false);
    analysis.mutate();
  };

  return {
    detail,
    analysis,
    analysisTimeout,
    retryAnalysis,
  };
}
