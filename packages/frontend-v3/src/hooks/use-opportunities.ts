"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost, apiPatch } from "@/lib/api";
import type {
  OpportunitySummary,
  OpportunityDetail,
} from "@/lib/types";

interface OpportunitiesPaginated {
  items: OpportunitySummary[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

export interface OpportunityMeta {
  total_count: number;
  due_this_week: number;
  unscored_count: number;
  total_value: number;
  grade_a_count: number;
  stage_counts: Record<string, number>;
}

interface OpportunitiesPagedResponse {
  items: OpportunitySummary[];
  total: number;
  page: number;
  totalPages: number;
  meta?: OpportunityMeta;
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

export interface UseOpportunitiesPagedParams {
  q?: string;
  limit?: number;
  page?: number;
  status?: string;
  agency?: string;
  department?: string;
  naics?: string;
  grade?: string;
  grades?: string[];
  due_before?: string;
  due_after?: string;
  due?: string;
  set_asides?: string[];
  value_min?: number;
  value_max?: number;
  sources?: string[];
  stage?: string;
  relevant_only?: boolean;
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
        "grade[]": params.grades,
        due_before: params.due_before,
        due_after: params.due_after,
        due: params.due,
        "set_aside[]": params.set_asides,
        value_min: params.value_min,
        value_max: params.value_max,
        "source[]": params.sources,
        stage: params.stage,
        relevant_only: params.relevant_only === false ? "false" : undefined,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (!items) return false;
      const hasAnalyzing = items.some((i) => !i.pwin);
      return hasAnalyzing ? 10_000 : false;
    },
  });
}

export function useOpportunitiesInfinite(params: Omit<UseOpportunitiesPagedParams, "page">) {
  return useInfiniteQuery({
    queryKey: ["opportunities-infinite", params],
    queryFn: ({ pageParam = 1 }) =>
      apiGet<OpportunitiesPagedResponse>("/v3/opportunities", {
        q: params.q,
        limit: params.limit ?? 50,
        page: pageParam as number,
        status: params.status,
        agency: params.agency,
        department: params.department,
        naics: params.naics,
        grade: params.grade,
        "grade[]": params.grades,
        due_before: params.due_before,
        due_after: params.due_after,
        due: params.due,
        "set_aside[]": params.set_asides,
        value_min: params.value_min,
        value_max: params.value_max,
        "source[]": params.sources,
        stage: params.stage,
        relevant_only: params.relevant_only === false ? "false" : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) return lastPage.page + 1;
      return undefined;
    },
    refetchInterval: (query) => {
      const pages = query.state.data?.pages;
      if (!pages) return false;
      const hasAnalyzing = pages.some((p) => p.items.some((i) => !i.pwin));
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
      void qc.invalidateQueries({ queryKey: ["opportunities-infinite"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}

interface AnalyzeResponse {
  queued?: boolean;
  opportunity_id?: string;
  message?: string;
}

export function useAnalyzeOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<OpportunityDetail | AnalyzeResponse>(`/v3/opportunities/${id}/analyze`),
    onSuccess: (data, id) => {
      void qc.invalidateQueries({ queryKey: ["opportunity", id] });
      // If analysis was queued (202), poll for the result after a short delay
      if (data && "queued" in data && data.queued) {
        setTimeout(() => {
          void qc.invalidateQueries({ queryKey: ["opportunity", id] });
        }, 5_000);
      }
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
