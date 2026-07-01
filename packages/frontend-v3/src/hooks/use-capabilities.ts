import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

export type OU = "envision" | "riverstone" | "pd_systems";
export type EvidenceGrade = "A" | "B" | "C";

export interface Capability {
  id: string;
  ou: OU;
  name: string;
  category: string;
  description: string;
  naics_codes: string[];
  psc_codes: string[];
  agencies_strong_in: string[];
  past_performance_doc_ids: string[];
  key_personnel: string[];
  certifications: string[];
  evidence_grade: EvidenceGrade | null;
  active: boolean;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchReason {
  factor: string;
  weight: number;
  detail: string;
}

export interface CapabilityMatch {
  opportunity_id: string;
  capability_id: string;
  match_score: number;
  match_reasons: MatchReason[];
  computed_at: string;
  capability?: Capability;
}

export interface QualifyResult {
  qualified: boolean;
  reason: string;
  top_matches: CapabilityMatch[];
  doctrine_blocked: boolean;
  doctrine_exclusions: string[];
  capability_blocked: boolean;
}

export function useCapabilities(filters?: {
  ou?: OU;
  active?: boolean;
  category?: string;
}) {
  return useQuery({
    queryKey: ["capabilities", filters],
    queryFn: () =>
      apiGet<Capability[]>("/v3/capabilities", {
        ou: filters?.ou,
        active: filters?.active !== undefined ? String(filters.active) : undefined,
        category: filters?.category,
      }),
  });
}

export function useCapability(id: string | null) {
  return useQuery({
    queryKey: ["capabilities", id],
    queryFn: () => apiGet<Capability>(`/v3/capabilities/${id}`),
    enabled: !!id,
  });
}

export function useCreateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Capability>) =>
      apiPost<Capability>("/v3/capabilities", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
  });
}

export function useUpdateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Capability>) =>
      apiPatch<Capability>(`/v3/capabilities/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
  });
}

export function useSeedCapabilities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ inserted: number; skipped: number }>("/v3/capabilities/seed"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
  });
}

export function useCapabilityMatches(opportunityId: string | null) {
  return useQuery({
    queryKey: ["capability-matches", opportunityId],
    queryFn: () =>
      apiGet<CapabilityMatch[]>(
        `/v3/opportunities/${opportunityId}/capability-matches`,
      ),
    enabled: !!opportunityId,
  });
}

export function useComputeCapabilityMatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opportunityId: string) =>
      apiPost<CapabilityMatch[]>(
        `/v3/opportunities/${opportunityId}/capability-matches/compute`,
      ),
    onSuccess: (_data, opportunityId) => {
      void qc.invalidateQueries({
        queryKey: ["capability-matches", opportunityId],
      });
    },
  });
}

export function useQualifyCheck() {
  return useMutation({
    mutationFn: (opportunityId: string) =>
      apiPost<QualifyResult>(
        `/v3/opportunities/${opportunityId}/qualify-check`,
      ),
  });
}
