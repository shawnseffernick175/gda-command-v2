"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, getToken } from "@/lib/api";
import type {
  FinancialBibleVersion,
  FinancialBibleActiveResponse,
  FinancialBibleUploadResponse,
  FinancialRate,
  FinancialIndirect,
  FinancialHistoryItem,
  PricingScenarioSummary,
  PricingScenarioCreateResponse,
} from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";

export function useFinancialBibleActive() {
  return useQuery({
    queryKey: ["financial-bible", "active"],
    queryFn: () =>
      apiGet<FinancialBibleActiveResponse>("/v3/financial-bible/active"),
    retry: false,
  });
}

export function useFinancialBibleVersions() {
  return useQuery({
    queryKey: ["financial-bible", "versions"],
    queryFn: () =>
      apiGet<{ items: FinancialBibleVersion[] }>("/v3/financial-bible/versions"),
    retry: false,
  });
}

export function useFinancialBibleRates(params?: {
  labor_category?: string;
  clearance?: string;
  date?: string;
}) {
  return useQuery({
    queryKey: ["financial-bible", "rates", params],
    queryFn: () =>
      apiGet<{ items: FinancialRate[]; version_id: string }>(
        "/v3/financial-bible/rates",
        params,
      ),
    retry: false,
  });
}

export function useFinancialBibleIndirects() {
  return useQuery({
    queryKey: ["financial-bible", "indirects"],
    queryFn: () =>
      apiGet<{ items: FinancialIndirect[]; version_id: string }>(
        "/v3/financial-bible/indirects",
      ),
    retry: false,
  });
}

export function useFinancialBibleHistory() {
  return useQuery({
    queryKey: ["financial-bible", "history"],
    queryFn: () =>
      apiGet<{ items: FinancialHistoryItem[]; version_id: string }>(
        "/v3/financial-bible/history",
      ),
    retry: false,
  });
}

export function useFinancialBibleUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: {
      rates: File;
      indirects: File;
      odcs: File;
      history: File;
      notes?: string;
    }): Promise<FinancialBibleUploadResponse> => {
      const formData = new FormData();
      formData.append("rates_xlsx", files.rates);
      formData.append("indirects_xlsx", files.indirects);
      formData.append("odcs_xlsx", files.odcs);
      formData.append("history_xlsx", files.history);
      if (files.notes) {
        formData.append("notes", files.notes);
      }

      const token = getToken();
      const res = await fetch(`${API_BASE}/v3/financial-bible/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const envelope = await res.json();
      if (!envelope.success) {
        throw new Error(envelope.error?.message ?? "Upload failed");
      }
      return envelope.data as FinancialBibleUploadResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financial-bible"] });
    },
  });
}

export function useActivateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      return apiPost<{ activated: string }>(
        `/v3/financial-bible/activate/${versionId}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financial-bible"] });
    },
  });
}

export function usePricingScenarios(params?: {
  opportunity_id?: number;
  capture_id?: number;
}) {
  return useQuery({
    queryKey: ["pricing-scenarios", params],
    queryFn: () =>
      apiGet<{ items: PricingScenarioSummary[] }>(
        "/v3/pricing-scenarios",
        params as Record<string, string | number | boolean | undefined>,
      ),
    retry: false,
  });
}

export function useCreatePricingScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      title: string;
      opportunity_id?: number | null;
      capture_id?: number | null;
      contract_type?: string;
      period_months?: number;
      labor_mix: {
        labor_category: string;
        clearance: string;
        hours: number;
        rate_override?: number;
      }[];
      odc_items?: { category: string; amount: number; description?: string }[];
      notes?: string;
    }) => {
      return apiPost<PricingScenarioCreateResponse>(
        "/v3/pricing-scenarios",
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pricing-scenarios"] });
    },
  });
}
