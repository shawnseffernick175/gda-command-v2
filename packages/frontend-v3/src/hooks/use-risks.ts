import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { Risk, RiskEvent } from "@/lib/types";

interface RisksResponse {
  items: Risk[];
  total: number;
  limit: number;
  offset: number;
}

interface RiskDetailResponse extends Risk {
  events: RiskEvent[];
}

interface LaunchpadRisksResponse {
  items: Risk[];
  total: number;
  owner_concentration_warning: { owner: string; percentage: number } | null;
}

export function useRisks(params: {
  status?: string;
  category?: string;
  severity?: string;
  owner?: string;
  related_opportunity_id?: string;
  related_capture_id?: string;
  related_pipeline_item_id?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const queryParams: Record<string, string> = {};
  if (params.status) queryParams.status = params.status;
  if (params.category) queryParams.category = params.category;
  if (params.severity) queryParams.severity = params.severity;
  if (params.owner) queryParams.owner = params.owner;
  if (params.related_opportunity_id) queryParams.related_opportunity_id = params.related_opportunity_id;
  if (params.related_capture_id) queryParams.related_capture_id = params.related_capture_id;
  if (params.related_pipeline_item_id) queryParams.related_pipeline_item_id = params.related_pipeline_item_id;
  if (params.limit) queryParams.limit = String(params.limit);
  if (params.offset) queryParams.offset = String(params.offset);

  return useQuery({
    queryKey: ["risks", queryParams],
    queryFn: () => apiGet<RisksResponse>("/v3/risks", queryParams),
  });
}

export function useRisk(id: number | null) {
  return useQuery({
    queryKey: ["risks", id],
    queryFn: () => apiGet<RiskDetailResponse>(`/v3/risks/${id}`),
    enabled: id != null,
  });
}

export function useRiskEvents(riskId: number | null) {
  return useQuery({
    queryKey: ["risk-events", riskId],
    queryFn: () => apiGet<{ items: RiskEvent[] }>(`/v3/risks/${riskId}/events`),
    enabled: riskId != null,
  });
}

export function useLaunchpadRisks() {
  return useQuery({
    queryKey: ["risks", "launchpad"],
    queryFn: () => apiGet<LaunchpadRisksResponse>("/v3/risks/launchpad"),
  });
}

export function useEntityRisks(entityType: "opportunities" | "captures" | "pipeline", entityId: number | null) {
  return useQuery({
    queryKey: ["risks", entityType, entityId],
    queryFn: () => apiGet<{ items: Risk[]; total: number }>(`/v3/${entityType}/${entityId}/risks`),
    enabled: entityId != null,
  });
}

export function useCreateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Partial<Risk>, "id" | "score" | "created_at" | "updated_at">) =>
      apiPost<Risk>("/v3/risks", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["risks"] });
    },
  });
}

export function useUpdateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Risk> & { id: number }) =>
      apiPatch<Risk>(`/v3/risks/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["risks"] });
      void qc.invalidateQueries({ queryKey: ["risk-events"] });
    },
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/v3/risks/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["risks"] }),
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
