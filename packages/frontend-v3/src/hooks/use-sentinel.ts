"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { SentinelStatus } from "@/lib/types";

export function useSentinel() {
  return useQuery({
    queryKey: ["sentinel"],
    queryFn: () => apiGet<SentinelStatus>("/v3/sentinel/sources"),
    retry: false,
    refetchInterval: 60_000,
  });
}
