"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiGet } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedDocResponse {
  id: number;
  doc_kind: "briefing" | "capture_plan" | "win_themes";
  file_size_bytes: number;
  vault_doc_id: number | null;
  download_url: string;
}

export interface GeneratedDocListItem {
  id: number;
  doc_kind: string;
  opportunity_id: string | null;
  capture_id: string | null;
  vault_doc_id: number | null;
  file_size_bytes: number | null;
  created_at: string;
  opportunity_title: string | null;
  download_url: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ---------------------------------------------------------------------------
// Mutations — generate PDFs
// ---------------------------------------------------------------------------

export function useGenerateBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const res = await apiPost<Envelope<GeneratedDocResponse>>(
        "/v3/output-generators/briefing",
        { opportunity_id: opportunityId },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["output-generators"] });
      void qc.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export function useGenerateCapturePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (captureId: string) => {
      const res = await apiPost<Envelope<GeneratedDocResponse>>(
        "/v3/output-generators/capture-plan",
        { capture_id: captureId },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["output-generators"] });
      void qc.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export function useGenerateWinThemes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (captureId: string) => {
      const res = await apiPost<Envelope<GeneratedDocResponse>>(
        "/v3/output-generators/win-themes",
        { capture_id: captureId },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["output-generators"] });
      void qc.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Queries — list generated docs
// ---------------------------------------------------------------------------

export function useGeneratedDocuments(params: {
  opportunity_id?: string;
  capture_id?: string;
  doc_kind?: string;
} = {}) {
  return useQuery({
    queryKey: ["output-generators", params],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.opportunity_id) query.set("opportunity_id", params.opportunity_id);
      if (params.capture_id) query.set("capture_id", params.capture_id);
      if (params.doc_kind) query.set("doc_kind", params.doc_kind);
      const qs = query.toString();
      const res = await apiGet<Envelope<{ items: GeneratedDocListItem[] }>>(
        `/v3/output-generators/list${qs ? `?${qs}` : ""}`,
      );
      return res.data.items;
    },
  });
}
