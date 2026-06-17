"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

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
