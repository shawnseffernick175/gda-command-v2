const API_BASE = "/api";

interface GDAEnvelope<T> {
  success: boolean;
  workflow: string;
  action: string;
  dryRun: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: { code: string; message: string; detail: string | null } | null;
}

async function request<T>(path: string): Promise<GDAEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<GDAEnvelope<T>>;
}

export interface QACheckRow {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  durationMs: number;
}

export interface QAHealthSummary {
  total: number;
  passed: number;
  failed: number;
  warned: number;
}

export interface QAHealthData {
  overall: "healthy" | "degraded" | "down";
  summary: QAHealthSummary;
  rows: QACheckRow[];
  nextAction: string;
}

export interface QAFailure {
  id: string;
  workflow: string;
  action: string;
  errorCode: string;
  errorMessage: string;
  occurredAt: string;
  resolved: boolean;
}

export function fetchQAHealth() {
  return request<QAHealthData>("/qa/health");
}

export function fetchQALatestFailures() {
  return request<{ rows: QAFailure[] }>("/qa/latest-failures");
}
