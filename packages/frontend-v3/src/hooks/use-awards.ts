"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import type {
  Award,
  AwardAnalysis,
  AwardsKpis,
  WheelhouseNaics,
} from "@/lib/types";

/* ── Tab type ──────────────────────────────────────────────────── */

export type AwardsTab = "hot" | "90d" | "1yr" | "weak" | "vehicles" | "pursuing" | "all" | "excluded";

/* ── Paged list ────────────────────────────────────────────────── */

export interface UseAwardsPagedParams {
  tab?: AwardsTab;
  limit?: number;
  page?: number;
  search?: string;
  incumbent?: string;
  naics?: string;
  value_min?: number;
  value_max?: number;
  sort_by?: string;
  sort_dir?: string;
}

interface AwardsPagedResponse {
  items: Award[];
  total: number;
  page: number;
  totalPages: number;
}

export function useAwardsPaged(params: UseAwardsPagedParams = {}) {
  return useQuery({
    queryKey: ["awards-paged", params],
    queryFn: () =>
      apiGet<AwardsPagedResponse>("/v3/awards", {
        tab: params.tab ?? "hot",
        limit: params.limit ?? 50,
        page: params.page ?? 1,
        search: params.search || undefined,
        incumbent: params.incumbent || undefined,
        naics: params.naics || undefined,
        value_min: params.value_min !== undefined ? String(params.value_min) : undefined,
        value_max: params.value_max !== undefined ? String(params.value_max) : undefined,
        sort_by: params.sort_by || undefined,
        sort_dir: params.sort_dir || undefined,
      }),
  });
}

/* ── KPIs ──────────────────────────────────────────────────────── */

export function useAwardsKpis() {
  return useQuery({
    queryKey: ["awards", "kpis"],
    queryFn: () => apiGet<AwardsKpis>("/v3/awards/kpis"),
    staleTime: 30_000,
  });
}

/* ── Count (nav badge) ─────────────────────────────────────────── */

export function useAwardsCount() {
  return useQuery({
    queryKey: ["awards", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/awards/count"),
  });
}

/* ── Single detail ─────────────────────────────────────────────── */

export function useAwardDetail(id: string | null) {
  return useQuery({
    queryKey: ["awards", "detail", id],
    queryFn: () => apiGet<Award & { vehicle_fit: { short_name: string; name: string }[] }>(`/v3/awards/${id}`),
    enabled: !!id,
  });
}

/* ── Analyze ───────────────────────────────────────────────────── */

export function useAwardAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (awardId: string) =>
      apiPost<AwardAnalysis>(`/v3/awards/${awardId}/analyze`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}

/* ── Pursue ────────────────────────────────────────────────────── */

export function useAwardPursue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (awardId: string) =>
      apiPost<{ opportunity_id: number; already_linked: boolean }>(
        `/v3/awards/${awardId}/pursue`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}

/* ── Dismiss (Not Interested) ──────────────────────────────────── */

export function useAwardDismiss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ awardId, reason, note }: { awardId: string; reason: string; note?: string }) =>
      apiPost<{ dismissed: boolean }>(`/v3/awards/${awardId}/dismiss`, { reason, note }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}

export function useAwardUndismiss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (awardId: string) =>
      apiPost<{ undismissed: boolean }>(`/v3/awards/${awardId}/undismiss`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}

/* ── Wheelhouse NAICS ──────────────────────────────────────────── */

export function useWheelhouseNaics() {
  return useQuery({
    queryKey: ["wheelhouse", "naics"],
    queryFn: () => apiGet<{ items: WheelhouseNaics[] }>("/v3/wheelhouse/naics"),
  });
}

export function useAddWheelhouseNaics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { naics: string; label?: string; reason?: string }) =>
      apiPost<{ added: boolean; naics: string }>("/v3/wheelhouse/naics", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wheelhouse"] });
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}

export function useRemoveWheelhouseNaics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiDelete(`/v3/wheelhouse/naics/${code}`) as Promise<void>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wheelhouse"] });
      void queryClient.invalidateQueries({ queryKey: ["awards-paged"] });
      void queryClient.invalidateQueries({ queryKey: ["awards"] });
    },
  });
}
