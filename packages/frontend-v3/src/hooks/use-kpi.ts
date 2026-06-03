"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { KpiHeaderData } from "@/lib/types";

export function useKpiHeader() {
  return useQuery({
    queryKey: ["kpi", "header"],
    queryFn: () => apiGet<KpiHeaderData>("/v3/kpi/header"),
    retry: false,
  });
}
