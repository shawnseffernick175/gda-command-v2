import { useQuery } from '@tanstack/react-query';
import { fetchPipelineDetail } from '../api';

export function usePipelineDetail(id: string | null) {
  return useQuery({
    queryKey: ['pipeline', 'detail', id],
    queryFn: () => fetchPipelineDetail(id!),
    enabled: !!id,
  });
}
