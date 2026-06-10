"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export interface OverrideTotals {
  grade_overrides: number;
  stage_overrides: number;
  all_time: number;
  last_7d: number;
  last_30d: number;
}

export interface PivotRow {
  ai_value: string;
  human_value: string;
  count: number;
}

export interface AgreementRate {
  grade_pct: number;
  stage_pct: number;
  notes: string;
}

export interface NaicsDisagreement {
  naics: string;
  count: number;
  most_common: string;
}

export interface AgencyDisagreement {
  agency: string;
  count: number;
}

export interface RecentOverride {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  field_name: string;
  ai_value: string | null;
  human_value: string;
  reason: string | null;
  created_at: string;
}

export interface OverrideSummary {
  totals: OverrideTotals;
  grade_pivot: PivotRow[];
  stage_pivot: PivotRow[];
  agreement_rate: AgreementRate;
  top_disagreement_naics: NaicsDisagreement[];
  top_disagreement_agency: AgencyDisagreement[];
  recent: RecentOverride[];
}

export function useOverrideSummary(range: "7d" | "30d" | "all" = "30d") {
  return useQuery({
    queryKey: ["overrides", "summary", range],
    queryFn: () => apiGet<OverrideSummary>("/v3/overrides/summary", { range }),
  });
}

export function useOverrideGrade(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { new_grade: string; reason?: string }) =>
      apiPost<{ success: boolean; override_id?: string; noop?: boolean }>(
        `/v3/opportunities/${opportunityId}/override-grade`,
        params,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
  });
}

export function useOverrideStage(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { new_stage: string; reason?: string }) =>
      apiPost<{ success: boolean; override_id?: string; noop?: boolean }>(
        `/v3/opportunities/${opportunityId}/override-stage`,
        params,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}
