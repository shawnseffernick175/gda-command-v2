"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

// ─── Daily News ───────────────────────────────────────────────

export interface DailyNewsItem {
  id: number;
  source: string;
  source_id: string | null;
  source_url: string | null;
  title: string;
  agency: string | null;
  dollar_value: number | null;
  why_it_matters: string | null;
  relevance_score: number;
  posted_at: string | null;
  ingested_at: string;
  naics_code: string | null;
  set_aside: string | null;
  doctrine_excluded: boolean;
}

export interface DailyNewsResponse {
  items: DailyNewsItem[];
  total: number;
  generated_at: string;
  quiet_morning: boolean;
}

export function useDailyNews(opts: { limit?: number; showExcluded?: boolean } = {}) {
  return useQuery({
    queryKey: ["launchpad", "daily-news", opts],
    queryFn: () =>
      apiGet<DailyNewsResponse>("/v3/launchpad/daily-news", {
        limit: opts.limit ?? 15,
        show_excluded: opts.showExcluded ? "true" : undefined,
      }),
    staleTime: 60_000,
  });
}

// ─── Day-1 Banners ────────────────────────────────────────────

export interface Day1Banner {
  id: number;
  source: string;
  source_url: string | null;
  title: string;
  agency: string | null;
  dollar_value: number | null;
  why_it_matters: string | null;
  posted_at: string | null;
}

export interface Day1BannersResponse {
  banners: Day1Banner[];
  generated_at: string;
}

export function useDay1Banners() {
  return useQuery({
    queryKey: ["launchpad", "day-1-banners"],
    queryFn: () => apiGet<Day1BannersResponse>("/v3/launchpad/day-1-banners"),
    staleTime: 60_000,
  });
}

export function useDismissBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiPost<{ dismissed: boolean }>(`/v3/launchpad/day-1-banners/${id}/dismiss`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["launchpad", "day-1-banners"] });
    },
  });
}

// ─── Door Summaries ───────────────────────────────────────────

export interface DoorSummary {
  door_key: string;
  door_label: string;
  summary: string;
  generated_at: string;
}

export interface DoorSummariesResponse {
  summaries: DoorSummary[];
  generated_at: string;
}

export function useDoorSummaries() {
  return useQuery({
    queryKey: ["launchpad", "door-summaries"],
    queryFn: () => apiGet<DoorSummariesResponse>("/v3/launchpad/door-summaries"),
    staleTime: 5 * 60_000,
  });
}

// ─── News Feedback ────────────────────────────────────────────

export function useNewsFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { news_id: number; action: "clicked" | "dismissed" | "saved" }) =>
      apiPost<{ recorded: boolean }>("/v3/launchpad/news-feedback", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["launchpad", "daily-news"] });
    },
  });
}
