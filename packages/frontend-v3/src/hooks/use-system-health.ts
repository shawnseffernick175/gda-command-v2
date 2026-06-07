"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface SystemHealth {
  backend_api: "up" | "down";
  database: "up" | "down";
  agent_service: "up" | "down";
  mcp_server: "up" | "down";
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: () => apiGet<SystemHealth>("/v3/system/health"),
    refetchInterval: 30000,
    staleTime: 20000,
  });
}
