import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { DoctrinePrinciple, DoctrineConfigRow } from "@/hooks/use-doctrine";

export interface PwinWeights {
  base: number;
  incumbency_bonus: number;
  recompete_bonus: number;
  capability_match_multiplier: number;
  vehicle_access: number;
  clearance_fit: number;
  doctrine_bonus_max: number;
  margin_penalty: number;
  teaming_bonus: number;
  teaming_penalty: number;
  naics_small_setaside: number;
  naics_small_fullopen: number;
  existing_customer: number;
}

export interface WheelhouseConfig {
  naics_allowlist: string[];
  agency_allowlist: string[];
  dollar_min: number;
  dollar_max: number;
  setasides_pursued: string[];
  updated_at: string;
}

export interface ScoringDoctrineBundle {
  pwin_weights: PwinWeights;
  principles: DoctrinePrinciple[];
  rules: DoctrineConfigRow[];
  wheelhouse: WheelhouseConfig;
}

export interface PwinPreviewRow {
  pursuit_id: string;
  name: string;
  old_pwin: number;
  new_pwin: number;
  delta: number;
}

const QK = ["scoring-doctrine"] as const;

export function useScoringDoctrine() {
  return useQuery({
    queryKey: QK,
    queryFn: () => apiGet<ScoringDoctrineBundle>("/v3/config/scoring-doctrine"),
  });
}

export function useUpdatePwinWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weights: PwinWeights) =>
      apiPatch<PwinWeights>("/v3/config/pwin-weights", { weights }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useResetPwinWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<PwinWeights>("/v3/config/pwin-weights/reset"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}

export function usePreviewPwinWeights() {
  return useMutation({
    mutationFn: (weights: PwinWeights) =>
      apiPost<PwinPreviewRow[]>("/v3/config/pwin-weights/preview", { weights }),
  });
}

export function useUpdatePrinciple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; short_form?: string; long_form?: string; evaluation_prompt?: string }) =>
      apiPatch<DoctrinePrinciple>(`/v3/config/principles/${args.id}`, {
        ...(args.short_form !== undefined && { short_form: args.short_form }),
        ...(args.long_form !== undefined && { long_form: args.long_form }),
        ...(args.evaluation_prompt !== undefined && { evaluation_prompt: args.evaluation_prompt }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateDoctrineRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiPatch<DoctrineConfigRow>(`/v3/config/rules/${key}`, { value }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateWheelhouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<WheelhouseConfig>) =>
      apiPatch<WheelhouseConfig>("/v3/config/wheelhouse", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useResetWheelhouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<WheelhouseConfig>("/v3/config/wheelhouse/reset"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}
