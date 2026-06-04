"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { ActionItem, ActionItemDraft, PaginatedResponse } from "@/lib/types";

export function useActionItems(params: { status?: string; due?: string } = {}) {
  return useQuery({
    queryKey: ["action-items", params],
    queryFn: () =>
      apiGet<PaginatedResponse<ActionItem>>("/v3/action-items", {
        status: params.status,
        due: params.due,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasGenerating = items.some((i) =>
        i.drafts?.some((d) => d.status === "generating"),
      );
      return hasGenerating ? 5000 : false;
    },
  });
}

export function useCreateActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: {
      title: string;
      due_date?: string;
      owner?: string;
      linked_object?: string;
      linked_object_type?: string;
    }) => apiPost<ActionItem>("/v3/action-items", item),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["action-items"] });
    },
  });
}

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: string }) =>
      apiPost<ActionItemDraft>(`/v3/action-items/${id}/drafts`, { kind }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["action-items"] });
    },
  });
}

export function useUpdateActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...updates
    }: {
      id: number;
      status?: string;
      title?: string;
      due_date?: string;
      owner?: string;
    }) => apiPatch<ActionItem>(`/v3/action-items/${id}`, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["action-items"] });
    },
  });
}
