import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export interface FTSignalFeed {
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
  signal_strength: number;
  transition_tags: string[];
  source_url: string | null;
  published_at: string | null;
  ingested_at: string;
  institution_name: string | null;
  institution_type: string | null;
  pipeline_side: string;
  match_count: string;
}

export interface MatchEvidence {
  mission_tag_overlap: string[];
  mission_tag_unmatched: string[];
  timing_window_alignment: {
    need: string;
    solution: string;
    score: number;
  };
  source_history: {
    partnerships: number;
    prior_collaborations: string[];
  } | null;
  pursuit_reasoning: string;
  adoption_reasoning: string;
}

export interface FTMatchWithEvidence {
  id: string;
  need_signal_id: string;
  need_source: string;
  need_title: string;
  need_mission_tags: string[];
  need_source_url: string | null;
  need_institution: string | null;
  solution_signal_id: string;
  solution_source: string;
  solution_title: string;
  solution_mission_tags: string[];
  solution_source_url: string | null;
  solution_institution: string | null;
  mission_fit_score: string;
  technical_fit_score: string;
  timing_score: string;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  match_rationale: string | null;
  evidence: MatchEvidence | null;
  computed_at: string;
}

export interface ScoredCandidate {
  need_signal_id: string;
  solution_signal_id: string;
  need_title: string;
  need_source: string;
  need_source_url: string | null;
  need_mission_tags: string[];
  solution_title: string;
  solution_source: string;
  solution_source_url: string | null;
  solution_mission_tags: string[];
  mission_fit_score: number;
  technical_fit_score: number;
  timing_score: number;
  overall_score: number;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  evidence: MatchEvidence;
}

interface AnchorSignal {
  id: string;
  pipeline: string;
  title: string;
  source: string;
  mission_tags: string[];
}

interface MatchFromResponse {
  anchor: AnchorSignal;
  candidates: ScoredCandidate[];
}

interface NeedFeedResponse {
  needs: FTSignalFeed[];
  total: number;
}

interface SolutionFeedResponse {
  solutions: FTSignalFeed[];
  total: number;
}

interface MatchesResponse {
  matches: FTMatchWithEvidence[];
  total: number;
}

export function useFastracMatches() {
  return useQuery({
    queryKey: ["fastrac-matches"],
    queryFn: () => apiGet<MatchesResponse>("/v3/fastrac/matches"),
    staleTime: 60_000,
  });
}

export function useFastracNeedFeed() {
  return useQuery({
    queryKey: ["fastrac-need-feed"],
    queryFn: () => apiGet<NeedFeedResponse>("/v3/fastrac/need-feed"),
    staleTime: 60_000,
  });
}

export function useFastracSolutionFeed() {
  return useQuery({
    queryKey: ["fastrac-solution-feed"],
    queryFn: () => apiGet<SolutionFeedResponse>("/v3/fastrac/solution-feed"),
    staleTime: 60_000,
  });
}

export function useMatchFromNeed() {
  return useMutation({
    mutationFn: (needSignalId: string) =>
      apiPost<MatchFromResponse>("/v3/fastrac/match-from-need", {
        need_signal_id: needSignalId,
      }),
  });
}

export function useMatchFromSolution() {
  return useMutation({
    mutationFn: (solutionSignalId: string) =>
      apiPost<MatchFromResponse>("/v3/fastrac/match-from-solution", {
        solution_signal_id: solutionSignalId,
      }),
  });
}

export function usePromoteMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { need_signal_id: string; solution_signal_id: string }) =>
      apiPost<{ match_id: string }>("/v3/fastrac/promote-match", params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fastrac-matches"] });
      void qc.invalidateQueries({ queryKey: ["fastrac-need-feed"] });
      void qc.invalidateQueries({ queryKey: ["fastrac-solution-feed"] });
    },
  });
}
