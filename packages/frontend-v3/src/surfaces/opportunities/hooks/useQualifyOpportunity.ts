import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SuccessEnvelope, OpportunitySummary, TeamingFlag } from '../types';

interface QualifyResponse {
  opportunity: OpportunitySummary;
  teaming_flags: TeamingFlag[];
}

async function qualifyOpportunity(id: string): Promise<QualifyResponse> {
  const res = await fetch(`/v3/opportunities/${id}/qualify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Qualify failed: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<QualifyResponse>;
  return envelope.data;
}

export function useQualifyOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => qualifyOpportunity(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunity'] });
    },
  });
}
