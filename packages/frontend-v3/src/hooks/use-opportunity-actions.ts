"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost } from "@/lib/api";

export function useAssignOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ownerId }: { id: string; ownerId: number }) =>
      apiPatch<Record<string, unknown>>(`/v3/opportunities/${id}`, {
        owner_id: ownerId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}

export function usePassOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiPatch<Record<string, unknown>>(`/v3/opportunities/${id}`, {
        relevance_status: "manual_pass",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}

export function useUpdateTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      apiPatch<Record<string, unknown>>(`/v3/opportunities/${id}`, { tags }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiPost<Record<string, unknown>>(`/v3/opportunities/${id}/notes`, {
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}
