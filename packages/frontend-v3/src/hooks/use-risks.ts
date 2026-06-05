import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { Risk } from "@/lib/types";

interface RisksResponse {
  items: Risk[];
  total: number;
}

export function useRisks(params: { status?: string; category?: string } = {}) {
  return useQuery({
    queryKey: ["risks", params],
    queryFn: () =>
      apiGet<RisksResponse>("/v3/risks", params as Record<string, string>),
  });
}

export function useCreateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<Partial<Risk>, "id" | "score" | "created_at" | "updated_at">) =>
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
