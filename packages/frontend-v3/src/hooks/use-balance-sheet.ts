"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { BalanceSheetData } from "@/lib/types";

export function useBalanceSheet() {
  return useQuery({
    queryKey: ["financials", "balance-sheet"],
    queryFn: () => apiGet<BalanceSheetData>("/v3/financials/balance-sheet"),
    retry: false,
  });
}
