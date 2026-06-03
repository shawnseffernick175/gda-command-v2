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
