"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { GovTriContact, ContactCategory } from "@/lib/types";

export interface UseContactsParams {
  q?: string;
  agency?: string;
  category?: ContactCategory | "all";
  limit?: number;
  cursor?: number;
}

interface ContactsResponse {
  items: GovTriContact[];
  pagination: { hasMore: boolean; cursor: number | null };
}

export function useContacts(params: UseContactsParams = {}) {
  return useQuery({
    queryKey: ["contacts", params],
    queryFn: () =>
      apiGet<ContactsResponse>("/v3/contacts", {
        q: params.q || undefined,
        agency: params.agency || undefined,
        category: params.category || undefined,
        limit: params.limit ?? 100,
        cursor: params.cursor || undefined,
      }),
  });
}

export function useContactsCount(category?: ContactCategory | "all") {
  return useQuery({
    queryKey: ["contacts", "count", category],
    queryFn: () =>
      apiGet<{ count: number }>("/v3/contacts/count", {
        category: category || undefined,
      }),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      title?: string;
      agency?: string;
      company?: string;
      email?: string;
      phone?: string;
      contact_category: ContactCategory;
      linkedin_url?: string;
      notes?: string;
      source_label?: string;
    }) => apiPost<GovTriContact>("/v3/contacts", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      apiPatch<GovTriContact>(`/v3/contacts/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useEnrichContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiPost<GovTriContact>(`/v3/contacts/${id}/enrich`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/v3/contacts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
