import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPipelineList } from '../api';
import type { PipelineListParams } from '../types';

export function usePipelineList(params: PipelineListParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pipeline', 'list', params],
    queryFn: () => fetchPipelineList(params),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['pipeline', 'list'] });

  return { ...query, invalidate };
}
