"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type {
  ProjectListData,
  ProjectSnapshotData,
  ProjectTrendData,
} from "@/lib/types";

export function useProjectList(period?: string) {
  const params = period ? `?period=${encodeURIComponent(period)}` : "";
  return useQuery({
    queryKey: ["financials", "projects", period ?? "latest"],
    queryFn: () => apiGet<ProjectListData>(`/v3/financials/projects${params}`),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useProjectSnapshot(projectKey: string, period?: string) {
  const params = period ? `?period=${encodeURIComponent(period)}` : "";
  return useQuery({
    queryKey: ["financials", "project", projectKey, period ?? "latest"],
    queryFn: () =>
      apiGet<ProjectSnapshotData>(
        `/v3/financials/projects/${encodeURIComponent(projectKey)}${params}`,
      ),
    enabled: !!projectKey,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useProjectTrend(projectKey: string) {
  return useQuery({
    queryKey: ["financials", "project-trend", projectKey],
    queryFn: () =>
      apiGet<ProjectTrendData>(
        `/v3/financials/projects/${encodeURIComponent(projectKey)}/trend`,
      ),
    enabled: !!projectKey,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
