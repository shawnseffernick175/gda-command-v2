/** Standard GDA response envelope used by every API endpoint. */
export interface GDAEnvelope<T = unknown> {
  success: boolean;
  workflow: string;
  action: string;
  dryRun: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: GDAError | null;
}

export interface GDAError {
  code: string;
  message: string;
  detail: string | null;
}

/** QA health check result shape. */
export interface QAHealthStatus {
  platform: string;
  status: "healthy" | "degraded" | "down";
  checks: QACheck[];
  checkedAt: string;
}

export interface QACheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  durationMs: number;
}

/** QA failure record shape. */
export interface QAFailure {
  id: string;
  workflow: string;
  action: string;
  errorCode: string;
  errorMessage: string;
  occurredAt: string;
  resolved: boolean;
}

/** Opportunity status values. */
export type OpportunityStatus =
  | "discovery"
  | "qualified"
  | "pipeline"
  | "lost"
  | "won";
