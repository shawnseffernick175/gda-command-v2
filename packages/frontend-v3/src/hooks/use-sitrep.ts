"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

export interface SitrepItem {
  id?: number;
  sitrep_id?: number;
  topic: string;
  discussion: string;
  action_items: string;
  sort_order: number;
  created_at?: string;
}

export interface Sitrep {
  id: number;
  sitrep_number: number;
  week_ending: string;
  created_at: string;
  items?: SitrepItem[];
}

export interface SitrepCreatePayload {
  sitrep_number: number;
  week_ending: string;
  items: Array<{
    topic: string;
    discussion?: string;
    action_items?: string;
    sort_order?: number;
  }>;
}

export interface SitrepUpdatePayload {
  sitrep_number?: number;
  week_ending?: string;
  items?: Array<{
    topic: string;
    discussion?: string;
    action_items?: string;
    sort_order?: number;
  }>;
}

export function useSitreps() {
  return useQuery({
    queryKey: ["digest", "sitreps"],
    queryFn: () => apiGet<Sitrep[]>("/v3/digest/sitrep"),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSitrep(id: number | null) {
  return useQuery({
    queryKey: ["digest", "sitrep", id],
    queryFn: () => apiGet<Sitrep>(`/v3/digest/sitrep/${id}`),
    enabled: id !== null,
    staleTime: 60 * 1000,
  });
}

export function useCreateSitrep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SitrepCreatePayload) =>
      apiPost<Sitrep>("/v3/digest/sitrep", payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["digest", "sitreps"] });
    },
  });
}

export function useUpdateSitrep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SitrepUpdatePayload }) =>
      apiPut<Sitrep>(`/v3/digest/sitrep/${id}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["digest"] });
    },
  });
}

export function useDeleteSitrep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/v3/digest/sitrep/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["digest", "sitreps"] });
    },
  });
}
