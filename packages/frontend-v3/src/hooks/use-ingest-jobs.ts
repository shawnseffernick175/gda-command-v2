"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, getToken } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";

export interface IngestJob {
  id: string;
  filename: string;
  file_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  source: "drag_drop" | "email_webhook" | "api_upload" | "backfill";
  source_surface: string | null;
  email_from: string | null;
  email_subject: string | null;
  status:
    | "pending"
    | "extracting"
    | "classifying"
    | "routing"
    | "routed"
    | "failed";
  target_surface: string | null;
  entity_type: string | null;
  classification_confidence: number | null;
  classification_rationale: string | null;
  doctrine_flag: string | null;
  evidence_grade: string | null;
  target_entity_id: string | null;
  action_item_id: number | null;
  vault_document_id: number | null;
  pii_detected: boolean;
  pii_redacted: boolean;
  error_message: string | null;
  error_step: string | null;
  owner: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface IngestJobsResponse {
  jobs: IngestJob[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface IngestJobsParams {
  status?: string;
  surface?: string;
  owner?: string;
  source?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export function useIngestJobs(params: IngestJobsParams = {}) {
  return useQuery({
    queryKey: ["ingest-jobs", params],
    queryFn: () =>
      apiGet<IngestJobsResponse>("/v3/ingest/jobs", {
        status: params.status || undefined,
        surface: params.surface || undefined,
        owner: params.owner || undefined,
        source: params.source || undefined,
        from_date: params.from_date || undefined,
        to_date: params.to_date || undefined,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      }),
    refetchInterval: 5000,
  });
}

export function useIngestJob(id: string | null) {
  return useQuery({
    queryKey: ["ingest-jobs", "detail", id],
    queryFn: () => apiGet<IngestJob>(`/v3/ingest/jobs/${id}`),
    enabled: id !== null,
    refetchInterval: 3000,
  });
}

export function useUploadIngest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      surface,
    }: {
      file: File;
      surface?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);

      const params = surface ? `?surface=${encodeURIComponent(surface)}` : "";
      const token = getToken();
      const res = await fetch(
        `${API_BASE}/v3/ingest/upload${params}`,
        {
          method: "POST",
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message ?? "Upload failed");
      }

      const envelope = await res.json();
      return envelope.data as { ingest_job_id: string; filename: string; status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingest-jobs"] });
    },
  });
}

export function useReclassifyIngest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      ingest_job_id: string;
      corrected_surface: string;
      corrected_entity_type: string;
      rationale?: string;
    }) => {
      return apiPost<{
        correction_id: string;
        original: { surface: string; entity_type: string };
        corrected: { surface: string; entity_type: string };
      }>("/v3/decision-memory/classification-correction", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingest-jobs"] });
    },
  });
}
