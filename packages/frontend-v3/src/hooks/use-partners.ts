"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface CapabilitySummaryItem {
  area: string;
  detail: string;
  evidence_doc_id: string | null;
}

export interface PastPerformanceItem {
  agency: string;
  contract_id: string | null;
  value: number | null;
  period: string;
  evidence_doc_id: string | null;
}

export interface KeyPersonnelItem {
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
  capabilities_summary: CapabilitySummaryItem[];
  past_performance_summary: PastPerformanceItem[];
  key_personnel: KeyPersonnelItem[];
  certifications: string[];
  active: boolean;
  last_reviewed_at: string;
  is_stale: boolean;
}

export interface PartnerListItem {
  ou: string;
  name: string;
  overview: string;
  capabilities_summary: CapabilitySummaryItem[];
  certifications: string[];
  agencies_of_strength: string[];
  naics_codes: string[];
  last_reviewed_at: string;
  is_stale: boolean;
}

export interface TeamingFitResult {
  ou: string;
  partner_name: string;
  fit_score: number;
  reasons: string[];
  cited_evidence: Array<{
    kind: string;
    detail: string;
    source: string;
  }>;
}

export function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: () => apiGet<{ items: PartnerListItem[] }>("/v3/partners"),
  });
}

export function usePartner(ou: string) {
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
      apiGet<{ items: TeamingFitResult[] }>(
        `/v3/partners/teaming-fit/${opportunityId}`
      ),
    enabled: !!opportunityId,
    staleTime: 60_000,
  });
}
