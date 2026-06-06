"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost, apiPatch } from "@/lib/api";
import type {
  OpportunitySummary,
  OpportunityDetail,
} from "@/lib/types";

interface OpportunitiesPaginated {
  items: OpportunitySummary[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

interface OpportunitiesPagedResponse {
  items: OpportunitySummary[];
  total: number;
  page: number;
  totalPages: number;
}

interface UseOpportunitiesParams {
  q?: string;
  limit?: number;
  cursor?: string;
  status?: string;
  agency?: string;
  department?: string;
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
        department: params.department,
        naics: params.naics,
        grade: params.grade,
        due_before: params.due_before,
        due_after: params.due_after,
      }),
  });
}

interface UseOpportunitiesPagedParams {
  q?: string;
  limit?: number;
  page?: number;
  status?: string;
  agency?: string;
  department?: string;
  naics?: string;
  grade?: string;
  due_before?: string;
  due_after?: string;
}

export function useOpportunitiesPaged(params: UseOpportunitiesPagedParams = {}) {
  return useQuery({
    queryKey: ["opportunities-paged", params],
    queryFn: () =>
      apiGet<OpportunitiesPagedResponse>("/v3/opportunities", {
        q: params.q,
        limit: params.limit ?? 100,
        page: params.page ?? 1,
        status: params.status,
        agency: params.agency,
        department: params.department,
        naics: params.naics,
        grade: params.grade,
        due_before: params.due_before,
        due_after: params.due_after,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (!items) return false;
      const hasAnalyzing = items.some((i) => !i.pwin);
      return hasAnalyzing ? 10_000 : false;
    },
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
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}

export function useAnalyzeOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<OpportunityDetail>(`/v3/opportunities/${id}/analyze`),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ["opportunity", id] });
    },
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiPatch<Record<string, unknown>>(`/v3/opportunities/${id}`, { stage }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["opportunity", vars.id] });
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
    },
  });
}
