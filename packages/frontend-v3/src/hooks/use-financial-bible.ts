"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, getToken } from "@/lib/api";
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
  ArByContractData,
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
    // The backend fetches the active tab's real data (single source of truth);
    // the client only needs to send which tab is active.
    mutationFn: (payload: { tab?: string }) =>
      apiPost<AiAnalyzeResponse>("/v3/financials/ai-analyze", payload),
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

export function useArByContract(mode: "CY" | "FY") {
  return useQuery({
    queryKey: ["financials", "ar-by-contract", mode],
    queryFn: () => apiGet<ArByContractData>("/v3/financials/ar/by-contract", { mode }),
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

// ── Financial Bible (F-311) ─────────────────────────────────────────────────

export interface BibleVersionSummary {
  id: string;
  uploaded_at: string;
  uploaded_by: string;
  notes: string | null;
  active: boolean;
  format_version: string;
  source_files: { rates_xlsx: string; indirects_xlsx: string; odcs_xlsx: string; history_xlsx: string };
  summary_stats: { rates: number; indirects: number; odcs: number; history: number } | null;
  rate_count: number;
  indirect_count: number;
  odc_count: number;
  history_count: number;
  scenario_count?: number;
}

export interface BibleActiveResponse {
  active: BibleVersionSummary | null;
}

export interface BibleVersionsResponse {
  items: BibleVersionSummary[];
  total: number;
}

export interface BibleRateItem {
  labor_category: string;
  clearance: string;
  rate: number;
  effective_from: string;
  effective_to: string | null;
}

export interface BibleIndirectItem {
  contract_type: string;
  fringe_pct: number;
  overhead_pct: number;
  ga_pct: number;
  fee_band_low: number;
  fee_band_high: number;
}

export interface BibleOdcItem {
  category: string;
  base_year: number;
  base_amount: number;
  escalation_pct: number;
  notes: string | null;
}

export interface BibleHistoryItem {
  pursuit_id: string;
  agency: string | null;
  outcome: string | null;
  bid_price: number | null;
  winner_price: number | null;
  notes: string | null;
}

export interface BibleVersionDetail {
  version: Omit<BibleVersionSummary, "rate_count" | "indirect_count" | "odc_count" | "history_count" | "scenario_count">;
  rates: BibleRateItem[];
  indirects: BibleIndirectItem[];
  odcs: BibleOdcItem[];
  history: BibleHistoryItem[];
}

export interface PricingScenarioSummary {
  id: string;
  bible_version_id: string;
  opportunity_id: number | null;
  capture_id: number | null;
  title: string;
  total_price: number;
  margin_pct: number;
  doctrine_pass: boolean;
  doctrine_notes: string | null;
  opportunity_title: string | null;
  created_at: string;
}

export interface PricingScenarioDetail extends PricingScenarioSummary {
  labor_mix: Array<{
    labor_category: string;
    clearance: string;
    hours: number;
    rate: number;
    cost: number;
  }>;
  period_months: number;
  indirect_rates: {
    fringe_pct: number;
    overhead_pct: number;
    ga_pct: number;
    contract_type: string;
  };
  total_direct: number;
  total_indirect: number;
  total_odc: number;
  total_cost: number;
  fee_pct: number;
  fee_amount: number;
  created_by: string;
}

export function useBibleActive() {
  return useQuery({
    queryKey: ["financial-bible", "active"],
    queryFn: () => apiGet<BibleActiveResponse>("/v3/financial-bible/active"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useBibleVersions() {
  return useQuery({
    queryKey: ["financial-bible", "versions"],
    queryFn: () =>
      apiGet<BibleVersionsResponse>("/v3/financial-bible/versions"),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useBibleVersionDetail(id: string | null) {
  return useQuery({
    queryKey: ["financial-bible", "versions", id],
    queryFn: () =>
      apiGet<BibleVersionDetail>(`/v3/financial-bible/versions/${id}`),
    enabled: !!id,
    retry: false,
  });
}

export function useBibleRates(params?: {
  labor_category?: string;
  clearance?: string;
  date?: string;
}) {
  return useQuery({
    queryKey: ["financial-bible", "rates", params],
    queryFn: () =>
      apiGet<{ version_id: string; items: BibleRateItem[]; total: number }>(
        "/v3/financial-bible/rates",
        params as Record<string, string>,
      ),
    retry: false,
  });
}

export function useUploadBible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rates,
      indirects,
      odcs,
      history,
      notes,
      formatVersion,
    }: {
      rates: File;
      indirects: File;
      odcs: File;
      history: File;
      notes?: string;
      formatVersion?: string;
    }) => {
      const API_BASE =
        process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";
      const fd = new FormData();
      fd.append("rates", rates);
      fd.append("indirects", indirects);
      fd.append("odcs", odcs);
      fd.append("history", history);
      if (notes) fd.append("notes", notes);
      if (formatVersion) fd.append("format_version", formatVersion);

      const token = getToken();
      const res = await fetch(`${API_BASE}/v3/financial-bible/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const envelope = await res.json();
      if (!envelope.success) {
        throw new Error(envelope.error?.message ?? "Upload failed");
      }
      return envelope.data as {
        version_id: string;
        summary: { rates: number; indirects: number; odcs: number; history: number };
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["financial-bible"] });
    },
  });
}

export function useActivateBibleVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      apiPost<{ activated: string }>(
        `/v3/financial-bible/activate/${versionId}`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["financial-bible"] });
    },
  });
}

export function useCreatePricingScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      title: string;
      opportunity_id?: number | null;
      capture_id?: number | null;
      bible_version_id?: string;
      labor_mix: Array<{
        labor_category: string;
        clearance: string;
        hours: number;
        rate_override?: number;
      }>;
      period_months?: number;
      contract_type?: string;
      fee_pct?: number;
      odc_amount?: number;
    }) =>
      apiPost<PricingScenarioDetail>("/v3/pricing-scenarios", payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pricing-scenarios"] });
    },
  });
}

export function usePricingScenarios(params?: {
  opportunity_id?: string;
  capture_id?: string;
}) {
  return useQuery({
    queryKey: ["pricing-scenarios", params],
    queryFn: () =>
      apiGet<{ items: PricingScenarioSummary[]; total: number }>(
        "/v3/pricing-scenarios",
        params as Record<string, string>,
      ),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
