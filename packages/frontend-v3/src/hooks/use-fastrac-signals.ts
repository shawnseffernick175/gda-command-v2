import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export type FasTracTab = "government" | "industry" | "academia";

export interface FTSignal {
  id: string;
  pipeline: "tech" | "requirement";
  source: string;
  title: string;
  summary: string | null;
  mission_tags: string[];
  problem_tags: string[];
  maturity: string | null;
  urgency: string | null;
  horizon: string;
  signal_strength: number;          // 1-5
  transition_tags: string[];
  source_url: string | null;
  published_at: string | null;
  ingested_at: string;
  next_review_at: string | null;
  next_review_action: string | null;
  pipeline_side: "government" | "industry";
  institution_type: string | null;
  institution_name: string | null;
  doi: string | null;
}

export interface FTMatch {
  id: string;
  tech_id: string;
  tech_source: string;
  tech_title: string;
  tech_mission_tags: string[];
  tech_source_url: string | null;
  req_id: string;
  req_source: string;
  req_title: string;
  req_mission_tags: string[];
  req_source_url: string | null;
  mission_fit_score: string;
  technical_fit_score: string;
  timing_score: string;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  match_rationale: string | null;
  computed_at: string;
}

export interface FTMatchAnalysis {
  match_id: number;
  broker_role: string | null;
  gap_analysis: string | null;
  recommended_actions: Array<{ action: string; priority: string; vehicle: string }>;
  risk_flags: Array<{ risk: string; severity: string }>;
  envision_fit: string | null;
  ai_narrative: string | null;
  model_used: string | null;
  generated_at: string;
  from_cache?: boolean;
}

interface SignalsResponse {
  tech: FTSignal[];
  requirement: FTSignal[];
  total: number;
}

interface MatchesResponse {
  matches: FTMatch[];
  total: number;
}

export function useFTSignals(tab?: FasTracTab) {
  return useQuery({
    queryKey: ["ft-signals", tab],
    queryFn: () =>
      apiGet<SignalsResponse>("/v3/fastrac/signals", tab ? { tab } : undefined),
    staleTime: 60_000,
  });
}

export function useFTMatches(tab?: FasTracTab) {
  return useQuery({
    queryKey: ["ft-matches", tab],
    queryFn: () =>
      apiGet<MatchesResponse>("/v3/fastrac/signals/matches", tab ? { tab } : undefined),
    staleTime: 60_000,
  });
}

export function useFTMatchAnalysis(matchId: string | null) {
  return useQuery({
    queryKey: ["ft-match-analysis", matchId],
    queryFn: () => apiGet<FTMatchAnalysis>(`/v3/fastrac/matches/${matchId}/analysis`),
    enabled: !!matchId,
    staleTime: 120_000,
    retry: false,
  });
}

export function useRunFTMatchAnalysis() {
  return useMutation({
    mutationFn: async (matchId: string) =>
      apiPost<FTMatchAnalysis>(`/v3/fastrac/matches/${matchId}/analyze`),
  });
}
