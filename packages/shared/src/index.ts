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

/** Opportunity record matching Postgres schema + S-009 spec. */
export interface Opportunity {
  id: string;
  title: string;
  agency: string | null;
  department: string | null;
  status: OpportunityStatus;
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

/** Qualify write result shape per S-008 spec. */
export interface QualifyResult {
  opportunity_id: string;
  title: string;
  prev_status: OpportunityStatus;
  new_status: OpportunityStatus;
  qualified_at: string;
  correlation_id: string;
}

/** Opportunity list query filters. */
export interface OpportunityFilters {
  search?: string;
  status?: OpportunityStatus;
  department?: string;
  minPwin?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}
