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

export interface QACheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  durationMs: number;
}

export interface QAHealthData {
  platform: string;
  status: "healthy" | "degraded" | "down";
  checks: QACheck[];
  checkedAt: string;
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
  return request<{ failures: QAFailure[] }>("/qa/latest-failures");
}
