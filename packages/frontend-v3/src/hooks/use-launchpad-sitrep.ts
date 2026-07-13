"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, getToken } from "@/lib/api";

export interface LaunchpadSitrepDocument {
  id: number;
  filename: string;
  file_size_bytes: number | null;
  uploaded_at: string;
}

export interface LaunchpadSitrepResponse {
  date: string;
  bullets: string[];
  documents: LaunchpadSitrepDocument[];
  generated_at: string;
}

/** Today's date (YYYY-MM-DD) in Eastern Time — the canonical SITREP timezone. */
export function todayEastern(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function useLaunchpadSitrep(date: string) {
  return useQuery({
    queryKey: ["launchpad", "sitrep", date],
    queryFn: () =>
      apiGet<LaunchpadSitrepResponse>("/v3/launchpad/sitrep", { date }),
    staleTime: 5 * 60_000,
  });
}

export function useAddLaunchpadSitrepDocuments(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]): Promise<LaunchpadSitrepResponse> => {
      const API_BASE =
        process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";
      const formData = new FormData();
      formData.append("date", date);
      for (const file of files) {
        formData.append("files", file);
      }

      const token = getToken();
      const res = await fetch(`${API_BASE}/v3/launchpad/sitrep/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const envelope = await res.json();
      if (!envelope.success) {
        throw new Error(envelope.error?.message ?? "Upload failed");
      }
      return envelope.data as LaunchpadSitrepResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["launchpad", "sitrep", date], data);
      void queryClient.invalidateQueries({ queryKey: ["launchpad", "sitrep", date] });
    },
  });
}
