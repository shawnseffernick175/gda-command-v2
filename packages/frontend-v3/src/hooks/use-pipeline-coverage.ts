"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";

export interface CoveragePursuit {
  pipeline_item_id: string;
  opportunity_id: string;
  title: string;
  agency: string | null;
  capture_owner: string;
  stage: string;
  capture_value: number;
  pwin: number;
}

export interface CoverageLayer {
  key: string;
  label: string;
  required_min: number;
  required_max: number | null;
  actual: number;
  multiple: number;
  coverage: number;
  status: "green" | "yellow" | "red";
  pursuits: CoveragePursuit[];
}

export interface PipelineCoverageResponse {
  fy: number;
  aop_target: number;
  layers: CoverageLayer[];
}

export function usePipelineCoverage(fy: number) {
  return useQuery({
    queryKey: ["pipeline-coverage", fy],
    queryFn: () =>
      apiGet<PipelineCoverageResponse>("/v3/pipeline/coverage", { fy }),
  });
}

// Set the AOP revenue target FROM the Pipeline. This writes the canonical
// value, which the Financial Bible AOP plan/execution also read — so those
// caches are invalidated alongside Pipeline Coverage.
export function useSetPipelineAopTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { fy: number; aop_revenue_target: number }) =>
      apiPatch<{ fy: number; aop_target: number | null }>(
        "/v3/pipeline/coverage/aop-target",
        payload,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pipeline-coverage"] });
      void qc.invalidateQueries({ queryKey: ["financials", "aop-plan"] });
      void qc.invalidateQueries({ queryKey: ["financials", "aop-execution"] });
    },
  });
}
