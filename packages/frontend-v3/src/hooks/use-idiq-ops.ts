"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */

export interface TaskOrderFeedItem {
  id: string;
  vehicle_id: number;
  external_id: string;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  pool_or_lane: string | null;
  set_aside: string | null;
  naics_code: string | null;
  est_value_usd: number | null;
  posted_date: string | null;
  response_due: string | null;
  status: "open" | "closed" | "awarded" | "cancelled";
  source_url: string | null;
  envision_eligible: boolean | null;
  eligibility_reason: string | null;
  wheelhouse_score: number | null;
  heat_tier: "hot" | "eligible" | "watch" | "not_eligible";
  capture_id: number | null;
  not_pursuing_reason: string | null;
  first_seen_at: string;
  vehicle_short_name: string;
  vehicle_agency: string | null;
  days_left: number | null;
}

export interface TaskOrderFeedResponse {
  items: TaskOrderFeedItem[];
  total: number;
  page: number;
  limit: number;
}

export interface VehicleScorecard {
  id: number;
  name: string;
  short_name: string;
  contract_number: string | null;
  agency: string | null;
  ceiling_value: number | null;
  expiration_date: string | null;
  pools_held: string[] | null;
  set_asides_held: string[] | null;
  open_to_count: number;
  eligible_count: number;
  awarded_ltm: number;
  submitted_ytd: number;
  last_to_posted: string | null;
  next_close: string | null;
  polling_last: string | null;
  polling_status: string | null;
  polling_source: string | null;
}

export interface IdiqOpsKpis {
  open_eligible: number;
  hot_tos: number;
  submitted_qtd: number;
  awarded_ltm: number;
  win_rate_ltm: number;
}

export interface FeedFilters {
  vehicle_id?: number;
  eligibility?: "eligible" | "not_eligible" | "unclear";
  status?: string;
  heat?: string;
  closing_within_days?: number;
  agency?: string;
  page?: number;
  limit?: number;
}

/* ── Pipeline pursuit types ────────────────────────────────────── */

export interface IdiqPursuitItem {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_agency: string | null;
  opportunity_naics: string | null;
  opportunity_set_aside: string | null;
  opportunity_due_at: string | null;
  capture_owner: string;
  stage: string;
  resolved_value: number;
  resolved_pwin: number | null;
  resolved_weighted: number;
  pwin_score: number | null;
  pwin_band: string | null;
  solicitation_number: string | null;
  teaming_partners: string[];
  created_at: string;
  updated_at: string;
}

export interface IdiqPursuitsResponse {
  items: IdiqPursuitItem[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

/* ── Hooks ─────────────────────────────────────────────────────── */

export function useIdiqOpsPursuits(q?: string) {
  const params = new URLSearchParams();
  params.set("limit", "50");
  if (q) params.set("q", q);

  const qs = params.toString();
  return useQuery({
    queryKey: ["idiq-ops-pursuits", qs],
    queryFn: () =>
      apiGet<IdiqPursuitsResponse>(`/v3/idiq-ops/pursuits${qs ? `?${qs}` : ""}`),
  });
}

export function useIdiqOpsFeed(filters: FeedFilters) {
  const params = new URLSearchParams();
  if (filters.vehicle_id) params.set("vehicle_id", String(filters.vehicle_id));
  if (filters.eligibility) params.set("eligibility", filters.eligibility);
  if (filters.status) params.set("status", filters.status);
  if (filters.heat) params.set("heat", filters.heat);
  if (filters.closing_within_days)
    params.set("closing_within_days", String(filters.closing_within_days));
  if (filters.agency) params.set("agency", filters.agency);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const qs = params.toString();
  return useQuery({
    queryKey: ["idiq-ops-feed", qs],
    queryFn: () =>
      apiGet<TaskOrderFeedResponse>(`/v3/idiq-ops/feed${qs ? `?${qs}` : ""}`),
  });
}

export function useIdiqOpsScoreboard() {
  return useQuery({
    queryKey: ["idiq-ops-scoreboard"],
    queryFn: () => apiGet<VehicleScorecard[]>("/v3/idiq-ops/scoreboard"),
  });
}

export function useIdiqOpsKpis() {
  return useQuery({
    queryKey: ["idiq-ops-kpis"],
    queryFn: () => apiGet<IdiqOpsKpis>("/v3/idiq-ops/kpis"),
  });
}

export function useStartCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toId: string) =>
      apiPost<{ capture_id: number; to_id: string }>(
        `/v3/idiq-ops/tos/${toId}/start-capture`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["idiq-ops-feed"] });
      void qc.invalidateQueries({ queryKey: ["idiq-ops-kpis"] });
    },
  });
}

export function useMarkNotPursuing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ toId, reason }: { toId: string; reason?: string }) =>
      apiPost<{ marked: boolean }>(
        `/v3/idiq-ops/tos/${toId}/mark-not-pursuing`,
        { reason },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["idiq-ops-feed"] });
    },
  });
}
