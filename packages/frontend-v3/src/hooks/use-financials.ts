"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

interface ForecastItem {
  period: string;
  plan_orders: number;
  plan_sales: number;
  actual_orders: number;
  actual_sales: number;
  has_actuals: boolean;
}

interface TrendItem {
  period: string;
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
