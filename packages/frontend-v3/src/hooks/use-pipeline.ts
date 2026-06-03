"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { PipelineItem, PaginatedResponse } from "@/lib/types";

export function usePipeline(params: { limit?: number; stage?: string } = {}) {
  return useQuery({
    queryKey: ["pipeline", params],
    queryFn: () =>
      apiGet<PaginatedResponse<PipelineItem>>("/v3/pipeline", {
        limit: params.limit ?? 200,
        stage: params.stage,
      }),
  });
}

export function usePipelineDetail(id: string) {
  return useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => apiGet<PipelineItem>(`/v3/pipeline/${id}`),
    enabled: !!id,
  });
}
