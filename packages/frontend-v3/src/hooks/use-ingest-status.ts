"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export interface IngestRecords {
  fetched: number;
  new: number;
  updated: number;
  skipped: number;
}

export interface IngestCredits {
  used: number;
  budget: number;
  pct: number;
}

export interface IngestSourceStatus {
  source_key: string;
  display_name: string;
  status: "healthy" | "stale" | "error" | "unknown";
  last_run_at: string | null;
  last_run_duration_seconds: number | null;
  records_last_run: IngestRecords;
  next_run_at: string | null;
  scheduled_interval_hours: number;
  last_error: string | null;
  log_lines: string[];
  credits?: IngestCredits;
}

export interface IngestHealth {
  stale_count: number;
  error_count: number;
}

export function useIngestStatus() {
  return useQuery({
    queryKey: ["ingest-status"],
    queryFn: () => apiGet<IngestSourceStatus[]>("/v3/ingest/status"),
    refetchInterval: 60_000,
  });
}

export function useIngestHealth() {
  return useQuery({
    queryKey: ["ingest-health"],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech"}/v3/ingest/health`,
      );
      if (!res.ok) throw new Error("Failed to fetch ingest health");
      return res.json() as Promise<IngestHealth>;
    },
    refetchInterval: 5 * 60_000,
  });
}

export function useTriggerIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: string) =>
      apiPost<{ run_id: string; status: string }>(`/v3/ingest/trigger/${source}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ingest-status"] });
    },
  });
}
