"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { DailyBriefing } from "@/lib/types";

export function useTodayBriefing() {
  return useQuery({
    queryKey: ["briefing", "today"],
    queryFn: () => apiGet<DailyBriefing>("/v3/briefing/today"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useGenerateBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<DailyBriefing>("/v3/briefing/generate"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["briefing", "today"] });
    },
  });
}
