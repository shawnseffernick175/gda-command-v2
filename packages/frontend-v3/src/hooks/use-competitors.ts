import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { Competitor, CompetitorAnalysis } from "@/lib/types";

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

interface CompetitorsPagedResponse {
  items: Competitor[];
  total: number;
  page: number;
  totalPages: number;
}

interface UseCompetitorsPagedParams {
  q?: string;
  naics?: string;
  limit?: number;
  page?: number;
  sort_by?: string;
  sort_dir?: string;
}

export function useCompetitorsPaged(params: UseCompetitorsPagedParams = {}) {
  return useQuery({
    queryKey: ["competitors-paged", params],
    queryFn: () =>
      apiGet<CompetitorsPagedResponse>("/v3/competitors", {
        q: params.q,
        naics: params.naics,
        limit: params.limit ?? 100,
        page: params.page ?? 1,
        sort_by: params.sort_by,
        sort_dir: params.sort_dir,
      }),
  });
}

export function useCompetitorsCount() {
  return useQuery({
    queryKey: ["competitors-count"],
    queryFn: () => apiGet<{ count: number }>("/v3/competitors/count"),
  });
}

interface BlackHatAnalysisOutput {
  competitor: string;
  likely_approach: string;
  strengths: string[];
  weaknesses: string[];
  counter_strategy: string;
  intel_summary: string;
  generated_at: string;
  from_cache: boolean;
}

export function useBlackHatAnalysis(competitorName: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!competitorName) throw new Error("No competitor selected");
      return apiPost<BlackHatAnalysisOutput>(
        `/v3/competitors/${encodeURIComponent(competitorName)}/black-hat`,
      );
    },
  });
}

export function useCompetitorAnalysis(competitorName: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!competitorName) throw new Error("No competitor selected");
      return apiPost<CompetitorAnalysis>(
        `/v3/competitors/${encodeURIComponent(competitorName)}/analyze`,
      );
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
