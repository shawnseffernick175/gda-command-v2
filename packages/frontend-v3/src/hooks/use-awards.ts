"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Award, PaginatedResponse } from "@/lib/types";

export function useAwards(params: { limit?: number; outcome?: string } = {}) {
  return useQuery({
    queryKey: ["awards", params],
    queryFn: () =>
      apiGet<PaginatedResponse<Award>>("/v3/awards", {
        limit: params.limit ?? 100,
        outcome: params.outcome,
      }),
  });
}

export function useAwardsCount() {
  return useQuery({
    queryKey: ["awards", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/awards/count"),
  });
}
