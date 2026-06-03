"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { CaptureDetail } from "@/lib/types";

export function useCapture(id: string) {
  return useQuery({
    queryKey: ["capture", id],
    queryFn: () => apiGet<CaptureDetail>(`/v3/captures/${id}`),
    enabled: !!id,
  });
}
