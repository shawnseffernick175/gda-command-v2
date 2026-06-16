import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { FastTrackAssessment } from "@/lib/types";

interface FasTracListResponse {
  items: (FastTrackAssessment & { title?: string })[];
  next_cursor: string | null;
}

interface FasTracInput {
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
}

export function useFasTracList() {
  return useQuery({
    queryKey: ["fastrac", "list"],
    queryFn: () => apiGet<FasTracListResponse>("/v3/fastrac", { limit: "25" }),
  });
}

export function useRunFasTrac() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FasTracInput) =>
      apiPost<FastTrackAssessment>("/v3/fastrac", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fastrac"] }),
  });
}
