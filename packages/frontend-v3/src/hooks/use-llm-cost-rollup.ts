"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface CostRollupEntry {
  task: string;
  provider: string;
  model: string;
  call_count: number;
  error_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
}

export interface CostRollupResponse {
  window: string;
  entries: CostRollupEntry[];
  totals: {
    call_count: number;
    error_count: number;
    total_cost_usd: number;
  };
  generated_at: string;
}

export type CostWindow = "live" | "1d" | "7d" | "30d";

export function useLlmCostRollup(window: CostWindow) {
  return useQuery({
    queryKey: ["llm-cost-rollup", window],
    queryFn: () =>
      apiGet<CostRollupResponse>("/v3/llm-cost-rollup", { window }),
    refetchInterval: window === "live" ? 30_000 : false,
  });
}
