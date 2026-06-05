"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type {
  CaptureColorStage,
  CaptureStageAnnotation,
  StageAnalysis,
} from "@/lib/types";

interface StagesResponse {
  stages: (CaptureColorStage & { annotations: CaptureStageAnnotation[] })[];
}

export function useCaptureStages(captureId: string | number) {
  return useQuery({
    queryKey: ["capture-stages", String(captureId)],
    queryFn: () => apiGet<StagesResponse>(`/v3/captures/${captureId}/stages`),
    enabled: !!captureId,
  });
}

export function useUpdateStage(captureId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      stage: string;
      status?: string;
      reviewer?: string;
      gate_decision?: string;
      gate_note?: string;
    }) => {
      const { stage, ...body } = params;
      return apiPatch<CaptureColorStage & { annotations: CaptureStageAnnotation[] }>(
        `/v3/captures/${captureId}/stages/${stage}`,
        body,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-stages", String(captureId)] });
    },
  });
}

export function useRunStageAnalysis(captureId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: string) =>
      apiPost<StageAnalysis>(`/v3/captures/${captureId}/stages/${stage}/analyze`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-stages", String(captureId)] });
    },
  });
}

export function useAddAnnotation(captureId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { stage: string; author?: string; body: string }) => {
      const { stage, ...body } = params;
      return apiPost<{ annotations: CaptureStageAnnotation[] }>(
        `/v3/captures/${captureId}/stages/${stage}/annotations`,
        body,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-stages", String(captureId)] });
    },
  });
}

export function useDeleteAnnotation(captureId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { stage: string; annotationId: number }) =>
      apiDelete(`/v3/captures/${captureId}/stages/${params.stage}/annotations/${params.annotationId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-stages", String(captureId)] });
    },
  });
}

export function useTakeSnapshot(captureId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: string) =>
      apiPost<{ snapshot: Record<string, unknown>; snapshot_at: string }>(
        `/v3/captures/${captureId}/stages/${stage}/snapshot`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-stages", String(captureId)] });
    },
  });
}

export function useUploadRfp(captureId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("rfp", file);
      const API_BASE =
        process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";
      const res = await fetch(`${API_BASE}/v3/captures/${captureId}/upload-rfp`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: { message?: string } })?.error?.message ?? "Upload failed",
        );
      }
      const envelope = await res.json();
      return (envelope as { data: { rfp_filename: string; char_count: number } }).data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture", String(captureId)] });
      void qc.invalidateQueries({ queryKey: ["capture-stages", String(captureId)] });
    },
  });
}
