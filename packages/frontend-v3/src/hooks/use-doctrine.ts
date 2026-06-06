import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";

export interface DoctrinePrinciple {
  id: string;
  name: string;
  short_form: string;
  long_form: string;
  evaluation_prompt: string;
  display_order: number;
}

export interface DoctrineExclusion {
  id: string;
  name: string;
  description: string;
  is_hard_block: boolean;
  override_requires: string | null;
  applies_to_ous: string[];
}

export interface DoctrineConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export function useDoctrinePrinciples() {
  return useQuery({
    queryKey: ["doctrine", "principles"],
    queryFn: () => apiGet<DoctrinePrinciple[]>("/v3/doctrine/principles"),
  });
}

export function useDoctrineExclusions() {
  return useQuery({
    queryKey: ["doctrine", "exclusions"],
    queryFn: () => apiGet<DoctrineExclusion[]>("/v3/doctrine/exclusions"),
  });
}

export function useDoctrineConfig() {
  return useQuery({
    queryKey: ["doctrine", "config"],
    queryFn: () => apiGet<DoctrineConfigRow[]>("/v3/doctrine/config"),
  });
}

export function useUpdateDoctrineConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiPatch<DoctrineConfigRow>(`/v3/doctrine/config/${key}`, { value }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["doctrine", "config"] }),
  });
}

export function useUpdateDoctrinePrinciple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, evaluation_prompt }: { id: string; evaluation_prompt: string }) =>
      apiPatch<DoctrinePrinciple>(`/v3/doctrine/principles/${id}`, { evaluation_prompt }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["doctrine", "principles"] }),
  });
}
