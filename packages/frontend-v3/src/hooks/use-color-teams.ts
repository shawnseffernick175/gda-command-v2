"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDownload } from "@/lib/api";
import type {
  ColorTeamRun,
  ColorTeamFinding,
  ColorTeamDocument,
  ColorTeamDiffResult,
  ColorTeamColor,
} from "@/lib/types";

// ── Documents ─────────────────────────────────────────────────

export function useColorTeamDocuments(opts?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["color-team-documents", opts?.limit, opts?.offset],
    queryFn: () =>
      apiGet<{ items: ColorTeamDocument[]; total: number }>("/v3/documents", {
        limit: opts?.limit ?? 50,
        offset: opts?.offset ?? 0,
      }),
  });
}

export function useColorTeamDocument(id: number | string | undefined) {
  return useQuery({
    queryKey: ["color-team-document", id],
    queryFn: () => apiGet<ColorTeamDocument>(`/v3/documents/${id}`),
    enabled: !!id,
  });
}

export function useUploadColorTeamDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      filename: string;
      storage_path: string;
      mime_type?: string;
      file_size_bytes?: number;
      doc_type?: string;
      opportunity_id?: string;
    }) => apiPost<ColorTeamDocument>("/v3/documents", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["color-team-documents"] });
    },
  });
}

// ── Runs ──────────────────────────────────────────────────────

export function useStartColorTeamRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      document_id: string | number;
      colors: ColorTeamColor[];
      linked_rfp_id?: string;
    }) =>
      apiPost<{ run_id: number; status: string }>("/v3/color-teams/run", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["color-team-runs"] });
      void qc.invalidateQueries({ queryKey: ["color-team-document-runs"] });
    },
  });
}

export function useColorTeamRun(runId: number | string | undefined) {
  return useQuery({
    queryKey: ["color-team-run", runId],
    queryFn: () => apiGet<ColorTeamRun>(`/v3/color-teams/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "queued" || status === "running") return 2000;
      return false;
    },
  });
}

export function useColorTeamDocumentRuns(docId: number | string | undefined) {
  return useQuery({
    queryKey: ["color-team-document-runs", docId],
    queryFn: () =>
      apiGet<{ runs: ColorTeamRun[]; total: number }>(
        `/v3/color-teams/documents/${docId}/runs`,
      ),
    enabled: !!docId,
  });
}

// ── Findings ─────────────────────────────────────────────────

export function useColorTeamFindings(
  runId: number | string | undefined,
  color?: string,
) {
  return useQuery({
    queryKey: ["color-team-findings", runId, color],
    queryFn: () =>
      apiGet<{ findings: ColorTeamFinding[]; total: number }>(
        `/v3/color-teams/runs/${runId}/findings`,
        color ? { color } : undefined,
      ),
    enabled: !!runId,
  });
}

// ── Diff ─────────────────────────────────────────────────────

export function useColorTeamDiff(
  runId: number | string | undefined,
  againstRunId: number | string | undefined,
) {
  return useQuery({
    queryKey: ["color-team-diff", runId, againstRunId],
    queryFn: () =>
      apiGet<ColorTeamDiffResult>(
        `/v3/color-teams/runs/${runId}/diff`,
        { against: String(againstRunId) },
      ),
    enabled: !!runId && !!againstRunId,
  });
}

// ── Action Items ─────────────────────────────────────────────

export function useSendFindingToActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: number | string) =>
      apiPost<{ action_item_id: number; finding_id: number }>(
        `/v3/color-teams/findings/${findingId}/to-action-item`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["color-team-findings"] });
      void qc.invalidateQueries({ queryKey: ["action-items"] });
    },
  });
}

// ── PDF Export ────────────────────────────────────────────────

export function useExportColorTeamPdf() {
  return useMutation({
    mutationFn: (runId: number | string) =>
      apiDownload(
        `/v3/color-teams/runs/${runId}/export.pdf`,
        `color-team-review-${runId}.pdf`,
      ),
  });
}
