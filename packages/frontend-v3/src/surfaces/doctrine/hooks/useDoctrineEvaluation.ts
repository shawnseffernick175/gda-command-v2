import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runDoctrineCheck, fetchDoctrineEvaluations } from '../api';
import type { DoctrineEvaluation } from '../types';

export function useDoctrineEvaluation(entityKind: string, entityId: string) {
  const query = useQuery<DoctrineEvaluation[]>({
    queryKey: ['doctrine-evaluations', entityKind, entityId],
    queryFn: () => fetchDoctrineEvaluations(entityKind, entityId),
    enabled: !!entityId,
  });

  return {
    evaluations: query.data ?? [],
    latest: query.data?.[0] ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useRunDoctrineCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityKind, entityId, context }: {
      entityKind: string;
      entityId: string;
      context?: Record<string, unknown>;
    }) => runDoctrineCheck(entityKind, entityId, context),
    onSuccess: (data: DoctrineEvaluation) => {
      void queryClient.invalidateQueries({
        queryKey: ['doctrine-evaluations', data.entity_kind, data.entity_id],
      });
    },
  });
}
