import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { Risk, RiskWithEvents, RiskEvent } from "@/lib/types";

interface RisksResponse {
  items: Risk[];
  total: number;
}

interface RiskEventsResponse {
  items: RiskEvent[];
  total: number;
}

export function useRisks(params: {
  status?: string;
  severity?: string;
  category?: string;
  owner?: string;
  opportunity_id?: string;
  source?: string;
} = {}) {
  return useQuery({
    queryKey: ["risks", params],
    queryFn: () =>
      apiGet<RisksResponse>("/v3/risks", params as Record<string, string>),
  });
}

export function useRisk(id: number | null) {
  return useQuery({
    queryKey: ["risks", id],
    queryFn: () => apiGet<RiskWithEvents>(`/v3/risks/${id}`),
    enabled: id != null,
  });
}

export function useRiskEvents(riskId: number | null) {
  return useQuery({
    queryKey: ["risk-events", riskId],
    queryFn: () => apiGet<RiskEventsResponse>(`/v3/risks/${riskId}/events`),
    enabled: riskId != null,
  });
}

export function useLaunchpadRisks() {
  return useQuery({
    queryKey: ["risks", "launchpad"],
    queryFn: () => apiGet<RisksResponse>("/v3/risks/launchpad"),
  });
}

export function useOpportunityRisks(opportunityId: number | string | null) {
  return useQuery({
    queryKey: ["risks", "opportunity", opportunityId],
    queryFn: () =>
      apiGet<RisksResponse>(`/v3/opportunities/${opportunityId}/risks`),
    enabled: opportunityId != null,
  });
}

export function useCreateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Partial<Risk>, "id" | "created_at" | "updated_at">) =>
      apiPost<Risk>("/v3/risks", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["risks"] }),
  });
}

export function useUpdateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Risk> & { id: number }) =>
      apiPatch<Risk>(`/v3/risks/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["risks"] }),
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/v3/risks/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["risks"] }),
  });
}

export function useAddRiskEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ riskId, ...body }: {
      riskId: number;
      event_type: string;
      detail?: Record<string, unknown>;
      actor?: string;
    }) => apiPost(`/v3/risks/${riskId}/events`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["risk-events"] });
      void qc.invalidateQueries({ queryKey: ["risks"] });
    },
  });
}

export function useGenerateRisks(opportunityId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error("No opportunity selected");
      return apiPost<{ risks_created: number; generation_summary: string; generated_at: string }>(
        `/v3/risks/generate/${opportunityId}`,
        {},
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["risks"] });
    },
  });
}
