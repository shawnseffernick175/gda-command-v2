"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

/* ── Types matching the backend /v3/pipeline response ─────────── */

export interface PipelineSummary {
  total_pipeline_value: number;
  weighted_pipeline_value: number;
  active_pursuits: number;
  proposals_out: number;
  won_ytd: number;
  by_stage: Record<string, PipelineStageStats>;
  stage_movers: PipelineStageMover[];
}

export interface PipelineStageStats {
  count: number;
  value: number;
  weighted_value: number;
}

export interface PipelineStageMover {
  internal_id: string;
  title: string;
  agency: string | null;
  value: number | null;
  from_stage: string | null;
  from_stage_label: string | null;
  to_stage: string;
  to_stage_label: string;
  moved_at: string;
  moved_by: string | null;
}

export interface PipelineListItem {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_agency: string | null;
  opportunity_naics: string | null;
  opportunity_set_aside: string | null;
  opportunity_due_at: string | null;
  opportunity_value_min: number | null;
  opportunity_value_max: number | null;
  opportunity_grade: string | null;
  capture_owner: string;
  win_prob_pct: number | null;
  stage: string;
  pwin_score: number | null;
  pwin_band: string | null;
  solicitation_number: string | null;
  resolved_value: number;
  resolved_pwin: number | null;
  resolved_weighted: number;
  teaming_partners: string[];
  created_at: string;
  updated_at: string;
}

interface PipelineListResponse {
  items: PipelineListItem[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

/* ── Hooks ────────────────────────────────────────────────────── */

export function usePipelineSummary() {
  return useQuery({
    queryKey: ["pipeline-summary"],
    queryFn: () => apiGet<PipelineSummary>("/v3/pipeline/summary"),
  });
}

export interface UsePipelineListParams {
  stage?: string;
  q?: string;
  limit?: number;
}

export function usePipelineList(params: UsePipelineListParams = {}) {
  return useQuery({
    queryKey: ["pipeline-list", params],
    queryFn: () =>
      apiGet<PipelineListResponse>("/v3/pipeline", {
        limit: params.limit ?? 200,
        stage: params.stage,
        q: params.q,
      }),
  });
}

/** Backward-compat wrapper used by Capture page. */
export function usePipeline(params: { limit?: number; stage?: string } = {}) {
  return useQuery({
    queryKey: ["pipeline", params],
    queryFn: () =>
      apiGet<PipelineListResponse>("/v3/pipeline", {
        limit: params.limit ?? 200,
        stage: params.stage,
      }),
  });
}

export function usePipelineDetail(id: string) {
  return useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => apiGet<PipelineListItem>(`/v3/pipeline/${id}`),
    enabled: !!id,
  });
}
