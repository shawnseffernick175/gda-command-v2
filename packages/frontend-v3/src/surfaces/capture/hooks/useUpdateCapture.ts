import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type { CaptureDetail, PricingData, TeamingPartner } from '../types';

interface UpdatePayload {
  pricing?: {
    labor_categories: { category: string; hours: number; rate: number }[];
  };
  teaming_partners?: { name: string; role: TeamingPartner['role'] }[];
}

interface UpdateResult {
  pricing: PricingData;
  teaming_partners: TeamingPartner[];
}

async function updateCapture(id: string, payload: UpdatePayload): Promise<UpdateResult> {
  return apiFetch<UpdateResult>(`/v3/captures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function useUpdateCapture(captureId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdatePayload) => updateCapture(captureId, payload),
    onSuccess: (result) => {
      queryClient.setQueryData<CaptureDetail>(['captures', 'detail', captureId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pricing: result.pricing,
          teaming_partners: result.teaming_partners,
        };
      });
    },
  });
}
