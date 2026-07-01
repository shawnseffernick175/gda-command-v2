"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiGet, apiDownload, apiFetchText } from "@/lib/api";

interface GeneratedDocSummary {
  id: number;
  doc_type: "briefing" | "capture_plan" | "win_themes";
  title: string;
  opportunity_id: string | null;
  capture_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface GenerateResult {
  id: number;
  doc_type: string;
  title: string;
  opportunity_id: string | null;
  capture_id: string | null;
  citations: unknown[];
  doctrine_refs: unknown[];
  created_at: string;
}

export function useGenerateBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opportunityId: string) =>
      apiPost<GenerateResult>("/v3/output-generators/briefing", {
        opportunity_id: opportunityId,
      }),
    onSuccess: (_data, opportunityId) => {
      void qc.invalidateQueries({
        queryKey: ["output-generators", { opportunity_id: opportunityId }],
      });
    },
  });
}

export function useGenerateCapturePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (captureId: string) =>
      apiPost<GenerateResult>("/v3/output-generators/capture-plan", {
        capture_id: captureId,
      }),
    onSuccess: (_data, captureId) => {
      void qc.invalidateQueries({
        queryKey: ["output-generators", { capture_id: captureId }],
      });
    },
  });
}

export function useGenerateWinThemes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (captureId: string) =>
      apiPost<GenerateResult>("/v3/output-generators/win-themes", {
        capture_id: captureId,
      }),
    onSuccess: (_data, captureId) => {
      void qc.invalidateQueries({
        queryKey: ["output-generators", { capture_id: captureId }],
      });
    },
  });
}

export function useGeneratedDocs(filters: {
  opportunity_id?: string;
  capture_id?: string;
}) {
  return useQuery({
    queryKey: ["output-generators", filters],
    queryFn: () =>
      apiGet<{ items: GeneratedDocSummary[]; total: number }>(
        "/v3/output-generators",
        {
          opportunity_id: filters.opportunity_id,
          capture_id: filters.capture_id,
        },
      ),
    enabled: !!(filters.opportunity_id || filters.capture_id),
  });
}

export function downloadGeneratedDoc(docId: number, title: string): void {
  void apiDownload(
    `/v3/output-generators/${docId}/html`,
    `${title.replace(/[^a-zA-Z0-9\s-]/g, "")}.html`,
  );
}

export async function fetchPreviewHtml(docId: number): Promise<string> {
  return apiFetchText(`/v3/output-generators/${docId}/html`);
}
