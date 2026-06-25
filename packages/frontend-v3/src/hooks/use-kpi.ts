"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { KpiHeaderData } from "@/lib/types";

export function useKpiHeader(calendarMode: "CY" | "FY" = "CY") {
  return useQuery({
    queryKey: ["kpi", "header", calendarMode],
    queryFn: () =>
      apiGet<KpiHeaderData>(`/v3/kpi/header?calendarMode=${calendarMode}`),
    retry: false,
  });
}
