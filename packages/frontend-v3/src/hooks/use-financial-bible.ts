"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type {
  IngestionStatus,
  ContractWaterfallData,
  AopExecutionData,
  AopCaptureData,
  P2FinancialsData,
  DefinitionsData,
  AiAnalyzeResponse,
} from "@/lib/types";

export function useIngestionStatus() {
  return useQuery({
    queryKey: ["financials", "ingestion-status"],
    queryFn: () => apiGet<IngestionStatus>("/v3/financials/ingestion-status"),
    retry: false,
    refetchInterval: 60_000,
  });
}

export function useContractWaterfall(params?: {
  from?: string;
  to?: string;
  parent_vehicle_id?: number;
  status?: string;
  prime_or_sub?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.parent_vehicle_id)
    searchParams.set("parent_vehicle_id", String(params.parent_vehicle_id));
  if (params?.status) searchParams.set("status", params.status);
  if (params?.prime_or_sub)
    searchParams.set("prime_or_sub", params.prime_or_sub);

  const qs = searchParams.toString();
  return useQuery({
    queryKey: ["financials", "contract-waterfall", qs],
    queryFn: () =>
      apiGet<ContractWaterfallData>(
        `/v3/financials/contract-waterfall${qs ? `?${qs}` : ""}`,
      ),
    retry: false,
  });
}

export function useAopExecution(fy: string) {
  return useQuery({
    queryKey: ["financials", "aop-execution", fy],
    queryFn: () =>
      apiGet<AopExecutionData>(
        `/v3/financials/aop-execution?fy=${encodeURIComponent(fy)}`,
      ),
    retry: false,
  });
}

export function useAopCapture(fy: string) {
  return useQuery({
    queryKey: ["financials", "aop-capture", fy],
    queryFn: () =>
      apiGet<AopCaptureData>(
        `/v3/financials/aop-capture?fy=${encodeURIComponent(fy)}`,
      ),
    retry: false,
  });
}

export function useP2Financials() {
  return useQuery({
    queryKey: ["financials", "p2"],
    queryFn: () => apiGet<P2FinancialsData>("/v3/financials/p2"),
    retry: false,
  });
}

export function useDefinitions() {
  return useQuery({
    queryKey: ["financials", "definitions"],
    queryFn: () => apiGet<DefinitionsData>("/v3/financials/definitions"),
    retry: false,
    staleTime: Infinity,
  });
}

export function useAiAnalyze() {
  return useMutation({
    mutationFn: (payload: {
      ytd_revenue?: number;
      ytd_expenses?: number;
      ytd_profit?: number;
      margin?: number;
      funded_backlog?: number;
      contracts?: Array<{
        name: string;
        revenue: number | null;
        cost: number | null;
        profit: number | null;
        margin: number | null;
      }>;
    }) => apiPost<AiAnalyzeResponse>("/v3/financials/ai-analyze", payload),
  });
}
