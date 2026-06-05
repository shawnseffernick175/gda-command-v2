import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Competitor } from "@/lib/types";

interface UseCompetitorsParams {
  q?: string;
  naics?: string;
  limit?: number;
}

interface CompetitorsResponse {
  items: Competitor[];
  total: number;
}

export function useCompetitors(params: UseCompetitorsParams = {}) {
  return useQuery({
    queryKey: ["competitors", params],
    queryFn: () =>
      apiGet<CompetitorsResponse>("/v3/competitors", params as Record<string, string>),
  });
}

export function useCompetitorsCount() {
  return useQuery({
    queryKey: ["competitors-count"],
    queryFn: () => apiGet<{ count: number }>("/v3/competitors/count"),
  });
}
