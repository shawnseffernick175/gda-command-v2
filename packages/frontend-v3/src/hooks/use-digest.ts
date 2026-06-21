"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────

export interface DigestSignal {
  id: string;
  type: "solicitation" | "gao_decision" | "regulation";
  title: string;
  agency: string | null;
  naics_code: string | null;
  value_estimate: string | null;
  source_url: string | null;
  ai_summary: string | null;
  posted_at: string;
}

export interface DigestLeadStory {
  headline: string;
  body: string;
  source_label: string;
  source_url: string | null;
  related_opportunity_ids: string[];
  generated_at: string;
}

export interface GaoDecision {
  id: number;
  decision_number: string;
  title: string | null;
  agency: string | null;
  incumbent: string | null;
  protestor: string | null;
  outcome: string | null;
  decision_date: string | null;
  source_url: string | null;
  ai_summary: string | null;
}

export interface RegulatoryEntry {
  id: number;
  title: string;
  document_type: string | null;
  effective_date: string | null;
  status: string | null;
  source_url: string | null;
}

export interface UpcomingSolicitation {
  id: string;
  title: string;
  naics_code: string | null;
  agency: string | null;
  response_due_at: string | null;
  source_url: string | null;
}

export interface DigestData {
  lead: DigestLeadStory | null;
  signals: {
    items: DigestSignal[];
    total: number;
    limit: number;
    offset: number;
  };
  regulatory: RegulatoryEntry[];
  upcoming_solicitations: UpcomingSolicitation[];
  gao_watchlist: GaoDecision[];
  last_updated: string | null;
}

// ─── Hooks ────────────────────────────────────────────────────────

export function useDigest() {
  return useQuery({
    queryKey: ["digest"],
    queryFn: () => apiGet<DigestData>("/v3/digest"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDigestSignals(opts: { limit?: number; offset?: number; category?: string }) {
  return useQuery({
    queryKey: ["digest", "signals", opts],
    queryFn: () =>
      apiGet<{ items: DigestSignal[]; total: number; limit: number; offset: number }>(
        "/v3/digest/signals",
        {
          limit: opts.limit ?? 20,
          offset: opts.offset ?? 0,
          ...(opts.category ? { category: opts.category } : {}),
        },
      ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDigestRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<DigestLeadStory>("/v3/digest/refresh"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["digest"] });
    },
  });
}
