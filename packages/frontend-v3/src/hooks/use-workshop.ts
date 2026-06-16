"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, getToken } from "@/lib/api";
import type {
  DocumentUpload,
  WorkshopListResponse,
  WorkshopOutput,
} from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";

export function useWorkshopUploads(page = 1) {
  return useQuery({
    queryKey: ["workshop", "uploads", page],
    queryFn: () =>
      apiGet<WorkshopListResponse>("/v3/workshop/uploads", { page, limit: 50 }),
  });
}

export function useWorkshopUpload(id: string | null) {
  return useQuery({
    queryKey: ["workshop", "upload", id],
    queryFn: () => apiGet<DocumentUpload>(`/v3/workshop/uploads/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.status === "analyzing") return 3000;
      return false;
    },
  });
}

export function useUploadWorkshopFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/v3/workshop/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body && typeof body === "object" && "error" in body
            ? (body as { error: { message: string } }).error.message
            : "Upload failed";
        throw new Error(msg);
      }
      const envelope = (await res.json()) as {
        success: boolean;
        data: DocumentUpload[];
      };
      return envelope.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workshop"] });
    },
  });
}

export function useClassifyUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      classification,
    }: {
      id: string;
      classification: string;
    }) => {
      return apiPost<{ id: string; classification: string; status: string }>(
        `/v3/workshop/uploads/${id}/classify`,
        { classification },
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workshop", "upload", vars.id] });
      qc.invalidateQueries({ queryKey: ["workshop", "uploads"] });
    },
  });
}

export function useReteardown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return apiPost<{ id: string; status: string }>(
        `/v3/workshop/uploads/${id}/teardown`,
      );
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["workshop", "upload", id] });
    },
  });
}

export function useGenerateOutput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      uploadId,
      output_type,
      output_format,
      config,
    }: {
      uploadId: string;
      output_type: string;
      output_format: string;
      config?: Record<string, unknown>;
    }) => {
      return apiPost<WorkshopOutput>(
        `/v3/workshop/uploads/${uploadId}/generate`,
        { output_type, output_format, config },
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["workshop", "upload", vars.uploadId],
      });
    },
  });
}

export function useDeleteWorkshopUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(`/v3/workshop/uploads/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workshop"] });
    },
  });
}
