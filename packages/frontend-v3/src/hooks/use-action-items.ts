"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { ActionItem, ActionItemDraft } from "@/lib/types";

interface ActionItemsPagedResponse {
  items: ActionItem[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
    page?: number;
    totalPages?: number;
    total?: number;
  };
}

export function useActionItems(params: {
  status?: string;
  due?: string;
  doctrine_source?: string;
  priority?: string;
  owner?: string;
  page?: number;
  sort_by?: string;
  sort_dir?: string;
} = {}) {
  return useQuery({
    queryKey: ["action-items", params],
    queryFn: () =>
      apiGet<ActionItemsPagedResponse>("/v3/action-items", {
        status: params.status,
        due: params.due,
        doctrine_source: params.doctrine_source,
        priority: params.priority,
        owner: params.owner,
        page: params.page,
        limit: 50,
        sort_by: params.sort_by,
        sort_dir: params.sort_dir,
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
      assignee_id?: number | null;
    }) => apiPatch<ActionItem>(`/v3/action-items/${id}`, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["action-items"] });
      void qc.invalidateQueries({ queryKey: ["top-action-items"] });
    },
  });
}

export function useTopActionItems(limit: number = 5) {
  return useQuery({
    queryKey: ["top-action-items", limit],
    queryFn: () =>
      apiGet<ActionItem[]>("/v3/action-items/top", { limit }),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await apiGet<{
        items: { id: number; display_name: string; email: string }[];
        total: number;
      }>("/v3/admin/users");
      return res.items;
    },
  });
}
