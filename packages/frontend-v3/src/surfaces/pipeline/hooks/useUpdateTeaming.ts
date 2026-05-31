import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTeaming } from '../api';
import type { TeamingRole, PipelinePartner } from '../types';

export function useUpdateTeaming() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      teaming,
      partners,
    }: {
      id: string;
      teaming: TeamingRole;
      partners: PipelinePartner[];
    }) => updateTeaming(id, { teaming, partners }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}
