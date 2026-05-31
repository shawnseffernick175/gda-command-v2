import { useMutation, useQueryClient } from '@tanstack/react-query';
import { advanceStage } from '../api';
import type { PipelineStage } from '../types';

export function useAdvanceStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) =>
      advanceStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}
