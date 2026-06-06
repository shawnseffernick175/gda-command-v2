"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete, getToken } from "@/lib/api";
import type {
  VaultDocument,
  VaultPaginatedResponse,
  VaultAuditEntry,
  VaultDocumentText,
  RegulatoryCatalogEntry,
} from "@/lib/types";

export interface UseVaultDocumentsParams {
  doc_type?: string;
  q?: string;
  category?: string;
  limit?: number;
  page?: number;
}

export function useVaultDocuments(params: UseVaultDocumentsParams = {}) {
  return useQuery({
    queryKey: ["vault", params],
    queryFn: () =>
      apiGet<VaultPaginatedResponse>("/v3/vault", {
        doc_type: params.doc_type || undefined,
        q: params.q || undefined,
        category: params.category || undefined,
        limit: params.limit ?? 50,
        page: params.page ?? 1,
      }),
  });
}

export function useVaultCount() {
  return useQuery({
    queryKey: ["vault", "count"],
    queryFn: () => apiGet<{ count: number }>("/v3/vault/count"),
  });
}

export function useVaultDocument(id: number | null) {
  return useQuery({
    queryKey: ["vault", "detail", id],
    queryFn: () => apiGet<VaultDocument>(`/v3/vault/${id}`),
    enabled: id !== null,
  });
}

export function useVaultDocumentText(id: number | null) {
  return useQuery({
    queryKey: ["vault", "text", id],
    queryFn: () => apiGet<VaultDocumentText>(`/v3/vault/${id}/text`),
    enabled: id !== null,
  });
}

export function useUploadVaultDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      docType,
    }: {
      file: File;
      docType: string;
    }): Promise<VaultDocument> => {
      const API_BASE =
        process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", docType);

      const token = getToken();
      const res = await fetch(`${API_BASE}/v3/vault/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const envelope = await res.json();
      if (!envelope.success) {
        throw new Error(envelope.error?.message ?? "Upload failed");
      }
      return envelope.data as VaultDocument;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export function useLinkVaultDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      opportunity_id,
      capture_id,
      award_id,
    }: {
      id: number;
      opportunity_id?: number;
      capture_id?: number;
      award_id?: number;
    }) =>
      apiPatch<VaultDocument>(`/v3/vault/${id}/link`, {
        opportunity_id,
        capture_id,
        award_id,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export function useVaultAudit(id: number | null) {
  return useQuery({
    queryKey: ["vault", "audit", id],
    queryFn: () => apiGet<VaultAuditEntry[]>(`/v3/vault/${id}/audit`),
    enabled: id !== null,
  });
}

export function useDeleteVaultDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => apiDelete(`/v3/vault/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export function useRegulatoryCatalog(params: { category?: string } = {}) {
  return useQuery({
    queryKey: ["vault", "regulatory-catalog", params],
    queryFn: () =>
      apiGet<RegulatoryCatalogEntry[]>("/v3/vault/regulatory/catalog", {
        category: params.category || undefined,
      }),
  });
}
