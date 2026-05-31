import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type { CaptureDetail, ColorStage } from '../types';

interface AdvanceResult {
  phase: ColorStage;
}

async function advanceColorReview(id: string): Promise<AdvanceResult> {
  return apiFetch<AdvanceResult>(`/v3/captures/${id}/advance-color-review`, { method: 'POST' });
}

export function useAdvanceColorReview(captureId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => advanceColorReview(captureId),
    onSuccess: (result) => {
      queryClient.setQueryData<CaptureDetail>(['captures', 'detail', captureId], (old) => {
        if (!old) return old;
        return { ...old, color_stage: result.phase };
      });
      queryClient.invalidateQueries({ queryKey: ['captures', 'list'] });
    },
  });
}
