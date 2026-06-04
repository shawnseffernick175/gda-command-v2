"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { GovTriContact } from "@/lib/types";

export interface UseContactsParams {
  q?: string;
  agency?: string;
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
        limit: params.limit ?? 100,
        cursor: params.cursor || undefined,
      }),
  });
}

export function useContactsCount() {
  return useQuery({
    queryKey: ["contacts", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/contacts/count"),
  });
}
