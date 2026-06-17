"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */

export interface RegulatoryNotice {
  id: number;
  document_number: string;
  title: string;
  agency_names: string[];
  publication_date: string;
  html_url: string;
  pdf_url: string | null;
  data_source: string;
}

interface RegulatoryListResponse {
  items: RegulatoryNotice[];
  next_cursor: string | null;
}

/* ── List hook ─────────────────────────────────────────────────── */

export interface UseRegulatoryListParams {
  agency?: string;
  published_after?: string;
  published_before?: string;
  limit?: number;
  cursor?: string;
}

export function useRegulatoryList(params: UseRegulatoryListParams = {}) {
  return useQuery({
    queryKey: ["regulatory-notices", params],
    queryFn: () =>
      apiGet<RegulatoryListResponse>("/v3/regulatory-notices", {
        agency: params.agency || undefined,
        published_after: params.published_after || undefined,
        published_before: params.published_before || undefined,
        limit: params.limit ?? 50,
        cursor: params.cursor || undefined,
      }),
  });
}

/* ── Count hook (nav badge) ────────────────────────────────────── */

export function useRegulatoryCount() {
  return useQuery({
    queryKey: ["regulatory-notices", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/regulatory-notices/count"),
    staleTime: 60_000,
  });
}
