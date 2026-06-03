"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import type {
  OpportunitySummary,
  OpportunityDetail,
  PaginatedResponse,
} from "@/lib/types";

interface UseOpportunitiesParams {
  limit?: number;
  cursor?: string;
  status?: string;
  agency?: string;
  naics?: string;
}

export function useOpportunities(params: UseOpportunitiesParams = {}) {
  return useQuery({
    queryKey: ["opportunities", params],
    queryFn: () =>
      apiGet<PaginatedResponse<OpportunitySummary>>("/v3/opportunities", {
        limit: params.limit ?? 100,
        cursor: params.cursor,
        status: params.status,
        agency: params.agency,
        naics: params.naics,
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
