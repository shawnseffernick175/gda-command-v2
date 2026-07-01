"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */

export interface PartnerListItem {
  ou: string;
  name: string;
  overview: string;
  agencies_of_strength: string[];
  certifications: string[];
  active: boolean;
  stale: boolean;
  last_reviewed_at: string;
}

export interface CapabilitySummary {
  area: string;
  description: string;
}

export interface PastPerformanceEntry {
  agency: string;
  contract_id: string;
  value: string;
  period: string;
  evidence_doc_id: string | null;
}

export interface KeyPersonnel {
  name: string;
  clearance: string;
  certifications: string[];
}

export interface PartnerProfile {
  ou: string;
  name: string;
  owner: string;
  overview: string;
  agencies_of_strength: string[];
  naics_codes: string[];
  capabilities_summary: CapabilitySummary[];
  past_performance_summary: PastPerformanceEntry[];
  key_personnel: KeyPersonnel[];
  certifications: string[];
  active: boolean;
  last_reviewed_at: string;
  stale: boolean;
}

export interface TeamingFitResult {
  ou: string;
  partner_name: string;
  fit_score: number;
  reasons: string[];
  cited_evidence: Array<{ field: string; value: string }>;
}

/* ── Hooks ─────────────────────────────────────────────────────── */

export function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: () => apiGet<{ items: PartnerListItem[] }>("/v3/partners"),
  });
}

export function usePartnerProfile(ou: string) {
  return useQuery({
    queryKey: ["partner", ou],
    queryFn: () => apiGet<PartnerProfile>(`/v3/partners/${ou}`),
    enabled: !!ou,
  });
}

export function useTeamingFit(opportunityId: string | undefined) {
  return useQuery({
    queryKey: ["teaming-fit", opportunityId],
    queryFn: () =>
      apiPost<{ fits: TeamingFitResult[] }>("/v3/partners/teaming-fit", {
        opportunity_id: opportunityId,
      }),
    enabled: !!opportunityId,
    staleTime: 5 * 60 * 1000,
  });
}
