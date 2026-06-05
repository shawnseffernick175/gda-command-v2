import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { FastTrackAssessment } from "@/lib/types";

interface FastTrackListResponse {
  items: (FastTrackAssessment & { title?: string })[];
  next_cursor: string | null;
}

interface FastTrackInput {
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
}

export function useFastTrackList() {
  return useQuery({
    queryKey: ["fast-track", "list"],
    queryFn: () => apiGet<FastTrackListResponse>("/v3/fast-track", { limit: "25" }),
  });
}

export function useRunFastTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FastTrackInput) =>
      apiPost<FastTrackAssessment>("/v3/fast-track", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fast-track"] }),
  });
}
