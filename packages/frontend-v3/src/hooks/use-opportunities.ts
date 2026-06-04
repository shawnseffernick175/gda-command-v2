"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import type {
  OpportunitySummary,
  OpportunityDetail,
} from "@/lib/types";

interface OpportunitiesPaginated {
  items: OpportunitySummary[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

interface UseOpportunitiesParams {
  q?: string;
  limit?: number;
  cursor?: string;
  status?: string;
  agency?: string;
  naics?: string;
  grade?: string;
  due_before?: string;
  due_after?: string;
}

export function useOpportunities(params: UseOpportunitiesParams = {}) {
  return useQuery({
    queryKey: ["opportunities", params],
    queryFn: () =>
      apiGet<OpportunitiesPaginated>("/v3/opportunities", {
        q: params.q,
        limit: params.limit ?? 100,
        cursor: params.cursor,
        status: params.status,
        agency: params.agency,
        naics: params.naics,
        grade: params.grade,
        due_before: params.due_before,
        due_after: params.due_after,
      }),
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => apiGet<OpportunityDetail>(`/v3/opportunities/${id}`),
    enabled: !!id,
  });
}

export function useFieldOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      internalId,
      fieldName,
      fieldValue,
      reason,
    }: {
      internalId: string;
      fieldName: string;
      fieldValue: unknown;
      reason?: string;
    }) =>
      apiPut<Record<string, unknown>>(
        `/v3/opportunities/${internalId}/field-override`,
        { field_name: fieldName, field_value: fieldValue, reason },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}
