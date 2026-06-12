"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type {
  PeriodDetailData,
  CostDetailItem,
  IndirectExpenseItem,
  IndirectExpenseTrendItem,
} from "@/lib/types";

export interface ForecastItem {
  period: string;
  plan_orders: number;
  plan_sales: number;
  actual_orders: number;
  actual_sales: number;
  has_actuals: boolean;
}

export interface TrendItem {
  source: string;
  period: string;
  is_quarter: boolean;
  orders: number;
  sales: number;
  ebit: number;
  gross_margin: number;
  ros: number;
}

export function useFinancialsForecast() {
  return useQuery({
    queryKey: ["financials", "forecast"],
    queryFn: () => apiGet<{ items: ForecastItem[] }>("/v3/financials/forecast"),
    retry: false,
  });
}

export function useFinancialsTrend() {
  return useQuery({
    queryKey: ["financials", "trend"],
    queryFn: () => apiGet<{ items: TrendItem[] }>("/v3/financials/trend"),
    retry: false,
  });
}

export function useCostDetail(period?: string | null) {
  return useQuery({
    queryKey: ["financials", "cost-detail", period ?? "all"],
    queryFn: () => {
      const qs = period ? `?period=${encodeURIComponent(period)}` : "";
      return apiGet<{ items: CostDetailItem[] }>(`/v3/financials/cost-detail${qs}`);
    },
    retry: false,
  });
}

export function useCostDetailTrend() {
  return useQuery({
    queryKey: ["financials", "cost-detail", "trend"],
    queryFn: () =>
      apiGet<{ items: CostDetailItem[] }>("/v3/financials/cost-detail/trend"),
    retry: false,
  });
}

export function useIndirectExpenses(period?: string | null) {
  return useQuery({
    queryKey: ["financials", "indirect-expenses", period ?? "all"],
    queryFn: () => {
      const qs = period ? `?period=${encodeURIComponent(period)}` : "";
      return apiGet<{ items: IndirectExpenseItem[] }>(
        `/v3/financials/indirect-expenses${qs}`,
      );
    },
    retry: false,
  });
}

export function useIndirectExpensesTrend() {
  return useQuery({
    queryKey: ["financials", "indirect-expenses", "trend"],
    queryFn: () =>
      apiGet<{ items: IndirectExpenseTrendItem[] }>(
        "/v3/financials/indirect-expenses/trend",
      ),
    retry: false,
  });
}

export function usePeriodDetail(period: string | null) {
  return useQuery({
    queryKey: ["financials", "period-detail", period],
    queryFn: () =>
      apiGet<PeriodDetailData>(
        `/v3/financials/period-detail?period=${encodeURIComponent(period!)}`,
      ),
    enabled: !!period,
    retry: false,
  });
}
