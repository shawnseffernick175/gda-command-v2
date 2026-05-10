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

async function request<T>(path: string, init?: RequestInit): Promise<GDAEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<GDAEnvelope<T>>;
}

// Health check row — supports both mock (name/durationMs) and live (id/label/path/http/ms/bytes/tone) shapes
export interface QACheckRow {
  // Mock fields
  name?: string;
  status: string;
  message?: string;
  durationMs?: number;
  // Live n8n fields
  id?: string;
  label?: string;
  path?: string;
  http?: number;
  ms?: number;
  bytes?: number;
  tone?: string;
  error?: string | null;
}

export interface QAHealthSummary {
  total: number;
  passed: number;
  failed: number;
  warned?: number;
  authFails?: number;
  empty?: number;
  notConfigured?: number;
}

export interface QAHealthData {
  overall: string;
  summary: QAHealthSummary;
  rows: QACheckRow[];
  nextAction: string;
  source?: "mock" | "live";
}

// Failure row — supports both mock and live (n8n execution) shapes
export interface QAFailure {
  // Mock fields
  id?: string;
  workflow?: string;
  action?: string;
  errorCode?: string;
  errorMessage?: string;
  occurredAt?: string;
  resolved?: boolean;
  // Live n8n fields
  workflowName?: string;
  workflowId?: string;
  failedNode?: string;
  message?: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface QAFailuresData {
  rows: QAFailure[];
  source?: "mock" | "live";
}

export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number | null;
  updatedAt: string | null;
}

export interface WorkflowRegistryData {
  source: string;
  summary: { total: number; active: number };
  workflows: WorkflowSummary[];
}

export interface GatewayHealthData {
  status: string;
  uptimeSec: number;
  pid: number;
  nodeVersion: string;
  config: {
    webhookConfigured: boolean;
    apiConfigured: boolean;
    dbConfigured: boolean;
    missingForWebhook: string[];
    missingForApi: string[];
    missingForDb: string[];
  };
  db: { ok: boolean; latencyMs: number; error?: string } | null;
}

export function fetchQAHealth() {
  return request<QAHealthData>("/qa/health");
}

export function fetchQALatestFailures() {
  return request<QAFailuresData>("/qa/latest-failures");
}

export function fetchWorkflowRegistry() {
  return request<WorkflowRegistryData>("/workflows/registry");
}

export function fetchGatewayHealth() {
  return request<GatewayHealthData>("/health");
}

// --- Opportunities ---

export interface OpportunityRow {
  id: string;
  title: string;
  agency: string | null;
  department: string | null;
  status: string;
  score: number;
  value_estimated: number | null;
  probability_of_win: number | null;
  naics: string | null;
  psc: string | null;
  due_date: string | null;
  solicitation_number: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  incumbent: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  tags: string[];
  raw_source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunitiesData {
  opportunities: OpportunityRow[];
  source: "mock" | "db";
}

export interface QualifyResultData {
  opportunity_id: string;
  title: string;
  prev_status: string;
  new_status: string;
  qualified_at: string;
  correlation_id: string;
  would_write?: boolean;
  gates?: { dryRun: boolean; approve: boolean; writesEnabled: boolean };
}

export interface OpportunityQueryParams {
  search?: string;
  status?: string;
  department?: string;
  minPwin?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function fetchOpportunities(params: OpportunityQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.department) qs.set("department", params.department);
  if (params.minPwin !== undefined) qs.set("minPwin", String(params.minPwin));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const query = qs.toString();
  return request<OpportunitiesData>(`/opportunities${query ? `?${query}` : ""}`);
}

export function qualifyOpportunity(id: string, dryRun = true, approve = false) {
  return request<QualifyResultData>(`/opportunities/${id}/qualify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, approve }),
  });
}
