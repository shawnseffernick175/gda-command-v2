"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Award, AwardsPaginatedResponse } from "@/lib/types";

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
}

interface UseAwardsPagedParams {
  agency?: string;
  contract_type?: string;
  awarded_after?: string;
  limit?: number;
  page?: number;
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
      }),
  });
}

export function useAwardsCount() {
  return useQuery({
    queryKey: ["awards", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/awards/count"),
  });
}
