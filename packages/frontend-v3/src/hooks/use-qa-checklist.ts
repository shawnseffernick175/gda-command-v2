import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface QaChecklistItem {
  id: number;
  page_area: string;
  problem_summary: string;
  category: string;
  severity: string;
  status: string;
  github_issue: string | null;
  github_pr: string | null;
  evidence_note: string | null;
  verified_live: boolean;
  last_updated: string;
  is_seed: boolean;
}

interface UseQaChecklistParams {
  page_area?: string;
}

export function useQaChecklist(params: UseQaChecklistParams = {}) {
  return useQuery({
    queryKey: ["qa-checklist", params],
    queryFn: () =>
      apiGet<QaChecklistItem[]>("/v3/qa-checklist", params as Record<string, string>),
  });
}
