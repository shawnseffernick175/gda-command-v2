"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { ActionItem, PaginatedResponse } from "@/lib/types";

export function useActionItems(params: { status?: string; due?: string } = {}) {
  return useQuery({
    queryKey: ["action-items", params],
    queryFn: () =>
      apiGet<PaginatedResponse<ActionItem>>("/v3/action-items", {
        status: params.status,
        due: params.due,
      }),
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
