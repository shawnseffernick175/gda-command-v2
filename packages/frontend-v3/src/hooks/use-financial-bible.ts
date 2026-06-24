"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import type {
  IngestionStatus,
  ContractWaterfallData,
  AopExecutionData,
  AopCaptureData,
  AopPlanData,
  AopPlanValues,
  AopPlanSaveResponse,
  P2FinancialsData,
  DefinitionsData,
  AiAnalyzeResponse,
  ApData,
  ArData,
  TrialBalanceData,
  ProjectRevenueData,
  IngestionCoverageData,
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
    // Live data: always refetch on mount / fy change, never serve a stale
    // (possibly empty) cached body.
    staleTime: 0,
    refetchOnMount: "always",
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
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useAopPlan(fy: string) {
  return useQuery({
    queryKey: ["financials", "aop-plan", fy],
    queryFn: () =>
      apiGet<AopPlanData>(
        `/v3/financials/aop-plan?fy=${encodeURIComponent(fy)}`,
      ),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useSaveAopPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { fy: string } & AopPlanValues) =>
      apiPost<AopPlanSaveResponse>("/v3/financials/aop-plan", payload),
    onSuccess: () => {
      // The saved plan now drives AOP Execution — refresh both views.
      void qc.invalidateQueries({ queryKey: ["financials", "aop-plan"] });
      void qc.invalidateQueries({ queryKey: ["financials", "aop-execution"] });
    },
  });
}

export function useP2Financials() {
  return useQuery({
    queryKey: ["financials", "p2"],
    queryFn: () => apiGet<P2FinancialsData>("/v3/financials/p2"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
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

export function useCreateTaskOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      to_name: string;
      to_number: string;
      parent_vehicle_id?: number | null;
      prime_or_sub: "PRIME" | "SUB";
      customer_agency?: string | null;
      contracting_office?: string | null;
      pop_start?: string | null;
      pop_end?: string | null;
      total_ceiling?: number | null;
      funded_to_date?: number | null;
      status?: string;
      notes?: string | null;
    }) => apiPost<{ id: number }>("/v3/financials/task-orders", payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["financials", "contract-waterfall"] });
    },
  });
}

export function useBulkCreateTaskOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      task_orders: Array<{
        to_name: string;
        to_number: string;
        parent_vehicle_short_name?: string | null;
        prime_or_sub: "PRIME" | "SUB";
        customer_agency?: string | null;
        contracting_office?: string | null;
        pop_start?: string | null;
        pop_end?: string | null;
        total_ceiling?: number | null;
        funded_to_date?: number | null;
        status?: string;
        notes?: string | null;
      }>;
    }) =>
      apiPost<{ inserted: number; ids: number[] }>(
        "/v3/financials/task-orders/bulk",
        payload,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["financials", "contract-waterfall"] });
    },
  });
}

export function useDeleteTaskOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiDelete(`/v3/financials/task-orders/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["financials", "contract-waterfall"] });
    },
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

export function useApData() {
  return useQuery({
    queryKey: ["financials", "ap"],
    queryFn: () => apiGet<ApData>("/v3/financials/ap"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useArData() {
  return useQuery({
    queryKey: ["financials", "ar"],
    queryFn: () => apiGet<ArData>("/v3/financials/ar"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useTrialBalance() {
  return useQuery({
    queryKey: ["financials", "trial-balance"],
    queryFn: () => apiGet<TrialBalanceData>("/v3/financials/trial-balance"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useProjectRevenue() {
  return useQuery({
    queryKey: ["financials", "project-revenue"],
    queryFn: () => apiGet<ProjectRevenueData>("/v3/financials/project-revenue"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useIngestionCoverage() {
  return useQuery({
    queryKey: ["financials", "ingestion-coverage"],
    queryFn: () =>
      apiGet<IngestionCoverageData>("/v3/financials/ingestion-coverage"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
