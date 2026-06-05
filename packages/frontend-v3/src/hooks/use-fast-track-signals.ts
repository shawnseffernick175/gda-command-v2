import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

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
}

export interface FTMatch {
  id: string;
  tech_id: string;
  tech_source: string;
  tech_title: string;
  tech_mission_tags: string[];
  req_id: string;
  req_source: string;
  req_title: string;
  req_mission_tags: string[];
  mission_fit_score: string;
  technical_fit_score: string;
  timing_score: string;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  match_rationale: string | null;
  computed_at: string;
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

export function useFTSignals() {
  return useQuery({
    queryKey: ["ft-signals"],
    queryFn: () => apiGet<SignalsResponse>("/v3/fast-track/signals"),
    staleTime: 60_000,
  });
}

export function useFTMatches() {
  return useQuery({
    queryKey: ["ft-matches"],
    queryFn: () => apiGet<MatchesResponse>("/v3/fast-track/signals/matches"),
    staleTime: 60_000,
  });
}
