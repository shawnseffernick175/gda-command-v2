"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type {
  GovTriContact,
  ContactCategory,
  ContactsMeta,
  RelationshipTemp,
} from "@/lib/types";

export interface UseContactsParams {
  q?: string;
  agency?: string;
  category?: ContactCategory | "all";
  temperature?: RelationshipTemp | "all";
  linked?: "yes" | "no";
  source?: string;
  limit?: number;
  cursor?: number;
  page?: number;
}

interface ContactsResponse {
  items: GovTriContact[];
  pagination: { hasMore: boolean; cursor: number | null; page?: number; totalPages?: number; total?: number };
  meta: ContactsMeta;
}

export function useContacts(params: UseContactsParams = {}) {
  return useQuery({
    queryKey: ["contacts", params],
    queryFn: () =>
      apiGet<ContactsResponse>("/v3/contacts", {
        q: params.q || undefined,
        agency: params.agency || undefined,
        category: params.category || undefined,
        temperature: params.temperature || undefined,
        linked: params.linked || undefined,
        source: params.source || undefined,
        limit: params.page ? 50 : (params.limit ?? 100),
        cursor: params.page ? undefined : (params.cursor || undefined),
        page: params.page || undefined,
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

export function useLogContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiPost<GovTriContact>(`/v3/contacts/${id}/log-contact`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useLinkContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: number; opportunity_id?: number; capture_id?: number }) =>
      apiPost<GovTriContact>(`/v3/contacts/${body.id}/link`, {
        opportunity_id: body.opportunity_id,
        capture_id: body.capture_id,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useSearchLinkable(q: string) {
  return useQuery({
    queryKey: ["contacts", "search-linkable", q],
    queryFn: () =>
      apiGet<{
        opportunities: Array<{ id: number; title: string; stage: string | null; value: number | null }>;
        captures: Array<{ id: number; title: string; stage: string | null }>;
      }>("/v3/contacts/search-linkable", { q }),
    enabled: q.length > 0,
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
