"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

export interface Capability {
  id: string;
  ou: "envision" | "riverstone" | "pd_systems";
  name: string;
  category: string;
  description: string;
  naics_codes: string[];
  psc_codes: string[];
  agencies_strong_in: string[];
  past_performance_doc_ids: string[];
  key_personnel: string[];
  certifications: string[];
  evidence_grade: "A" | "B" | "C" | null;
  active: boolean;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapabilityMatch {
  opportunity_id: string;
  capability_id: string;
  capability_name: string;
  capability_category: string;
  capability_ou: string;
  match_score: number;
  match_reasons: Array<{
    factor: string;
    score: number;
    detail: string;
  }>;
  evidence_grade: string | null;
  computed_at: string;
}

export interface QualificationResult {
  qualified: boolean;
  recommendation: "qualify" | "disqualify";
  reasons: string[];
  top_matches: CapabilityMatch[];
  teaming_matches: CapabilityMatch[];
  doctrine_blocked: boolean;
  doctrine_exclusions: string[];
  best_envision_score: number;
  qualifying_capabilities_count: number;
}

export function useCapabilities(params?: { ou?: string; category?: string; include_inactive?: boolean }) {
  return useQuery({
    queryKey: ["capabilities", params],
    queryFn: () =>
      apiGet<Capability[]>("/v3/capabilities", {
        ou: params?.ou,
        category: params?.category,
        include_inactive: params?.include_inactive ? "true" : undefined,
      }),
  });
}

export function useCapability(id: string) {
  return useQuery({
    queryKey: ["capability", id],
    queryFn: () => apiGet<Capability>(`/v3/capabilities/${id}`),
    enabled: !!id,
  });
}

export function useCreateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Capability, "id" | "active" | "last_reviewed_at" | "created_at" | "updated_at">) =>
      apiPost<Capability>("/v3/capabilities", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["capabilities"] }),
  });
}

export function useUpdateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<Capability>) =>
      apiPatch<Capability>(`/v3/capabilities/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capabilities"] });
      void qc.invalidateQueries({ queryKey: ["capability"] });
    },
  });
}

export function useCapabilityMatches(opportunityId: string) {
  return useQuery({
    queryKey: ["capability-matches", opportunityId],
    queryFn: () => apiGet<CapabilityMatch[]>(`/v3/opportunities/${opportunityId}/capability-matches`),
    enabled: !!opportunityId,
  });
}

export function useComputeCapabilityMatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opportunityId: string) =>
      apiPost<CapabilityMatch[]>(`/v3/opportunities/${opportunityId}/capability-matches`),
    onSuccess: (_data, opportunityId) => {
      void qc.invalidateQueries({ queryKey: ["capability-matches", opportunityId] });
    },
  });
}

export function useQualifyCheck() {
  return useMutation({
    mutationFn: (opportunityId: string) =>
      apiPost<QualificationResult>(`/v3/opportunities/${opportunityId}/qualify-check`),
  });
}
