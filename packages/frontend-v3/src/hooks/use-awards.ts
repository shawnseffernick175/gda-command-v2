"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { Award, AwardAnalysis, AwardsMeta, AwardsPaginatedResponse } from "@/lib/types";

export interface UseAwardsParams {
  agency?: string;
  contract_type?: string;
  awarded_after?: string;
  limit?: number;
  cursor?: string;
}

export function useAwards(params: UseAwardsParams = {}) {
  return useQuery({
    queryKey: ["awards", params],
    queryFn: () =>
      apiGet<AwardsPaginatedResponse>("/v3/awards", {
        limit: params.limit ?? 100,
        agency: params.agency || undefined,
        contract_type: params.contract_type || undefined,
        awarded_after: params.awarded_after || undefined,
        cursor: params.cursor || undefined,
      }),
  });
}

interface AwardsPagedResponse {
  items: Award[];
  total: number;
  page: number;
  totalPages: number;
  meta?: AwardsMeta;
}

export interface UseAwardsPagedParams {
  agency?: string;
  contract_type?: string;
  awarded_after?: string;
  limit?: number;
  page?: number;
  recompete?: string;
  has_incumbent?: boolean;
  pursuing?: boolean;
  incumbent?: string;
  value_min?: number;
  value_max?: number;
  naics?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: string;
}

export function useAwardsPaged(params: UseAwardsPagedParams = {}) {
  return useQuery({
    queryKey: ["awards-paged", params],
    queryFn: () =>
      apiGet<AwardsPagedResponse>("/v3/awards", {
        limit: params.limit ?? 100,
        page: params.page ?? 1,
        agency: params.agency || undefined,
        contract_type: params.contract_type || undefined,
        awarded_after: params.awarded_after || undefined,
        recompete: params.recompete || undefined,
        has_incumbent: params.has_incumbent ? "true" : undefined,
        pursuing: params.pursuing ? "true" : undefined,
        incumbent: params.incumbent || undefined,
        value_min: params.value_min !== undefined ? String(params.value_min) : undefined,
        value_max: params.value_max !== undefined ? String(params.value_max) : undefined,
        naics: params.naics || undefined,
        search: params.search || undefined,
        sort_by: params.sort_by || undefined,
        sort_dir: params.sort_dir || undefined,
      }),
  });
}

export function useAwardsCount() {
  return useQuery({
    queryKey: ["awards", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/awards/count"),
  });
}

export function useAwardAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (awardId: string) =>
      apiPost<AwardAnalysis>(`/v3/awards/${awardId}/analyze`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}

export function useAwardPursue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (awardId: string) =>
      apiPost<{ opportunity_id: number; already_linked: boolean }>(
        `/v3/awards/${awardId}/pursue`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}
