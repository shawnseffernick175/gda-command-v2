"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { LaunchpadSummary, LaunchpadFlags, FunnelReport } from "@/lib/types";

export function useLaunchpadSummary() {
  return useQuery({
    queryKey: ["launchpad", "summary"],
    queryFn: () => apiGet<LaunchpadSummary>("/v3/launchpad/summary"),
  });
}

export function useLaunchpadFlags() {
  return useQuery({
    queryKey: ["launchpad", "flags"],
    queryFn: () => apiGet<LaunchpadFlags>("/v3/launchpad/flags"),
  });
}

export function useFunnelReport(windowDays?: number) {
  return useQuery({
    queryKey: ["reports", "funnel", windowDays],
    queryFn: () =>
      apiGet<FunnelReport>("/v3/reports/funnel", {
        window_days: windowDays,
      }),
  });
}

export interface LaunchpadSignals {
  briefing_date: string | null;
  market_intel: string | null;
  ft_signals: Array<{
    id: string;
    title: string;
    source: string;
    source_url: string | null;
    pipeline_side: string;
    urgency: string | null;
    created_at: string;
  }>;
  generated_at: string;
}

export function useLaunchpadSignals() {
  return useQuery({
    queryKey: ["launchpad", "signals"],
    queryFn: () => apiGet<LaunchpadSignals>("/v3/launchpad/signals"),
  });
}

export interface TopProgram {
  internal_id: string;
  title: string | null;
  agency: string | null;
  value: number | null;
  pwin: number | null;
  band: string;
  source_url: string | null;
}

export function useTopPrograms() {
  return useQuery({
    queryKey: ["launchpad", "top-programs"],
    queryFn: () =>
      apiGet<{ items: TopProgram[] }>("/v3/launchpad/top-programs"),
  });
}
