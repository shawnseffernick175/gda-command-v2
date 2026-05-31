import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type { CaptureDetail, ColorReviewPhase } from '../types';

interface AdvanceResult {
  phase: ColorReviewPhase;
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
        return { ...old, color_review_phase: result.phase };
      });
      queryClient.invalidateQueries({ queryKey: ['captures', 'list'] });
    },
  });
}
