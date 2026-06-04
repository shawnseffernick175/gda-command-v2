"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { AwardsPaginatedResponse } from "@/lib/types";

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

export function useAwardsCount() {
  return useQuery({
    queryKey: ["awards", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/awards/count"),
  });
}
