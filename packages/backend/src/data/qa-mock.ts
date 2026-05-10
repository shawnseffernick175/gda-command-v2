import type { QACheck, QAHealthStatus, QAFailure } from "@gda/shared";

const checks: QACheck[] = [
  {
    name: "React Build / CI",
    status: "pass",
    message: "React app builds successfully.",
    durationMs: 1240,
  },
  {
    name: "API Proxy",
    status: "pass",
    message: "API proxy routes responding.",
    durationMs: 85,
  },
  {
    name: "n8n Connectivity",
    status: "warn",
    message: "n8n reachable but 2 workflows inactive.",
    durationMs: 320,
  },
  {
    name: "Postgres Connection",
    status: "pass",
    message: "Database connection pool healthy.",
    durationMs: 12,
  },
  {
    name: "Dry-Run: Save Opportunity",
    status: "pass",
    message: "Dry-run envelope returned valid shape.",
    durationMs: 450,
  },
  {
    name: "Dry-Run: Risk Register",
    status: "pass",
    message: "Dry-run envelope returned valid shape.",
    durationMs: 380,
  },
];

export function getHealthStatus(): QAHealthStatus {
  const hasFailure = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");

  return {
    platform: "GDA Command v2",
    status: hasFailure ? "down" : hasWarn ? "degraded" : "healthy",
    checks,
    checkedAt: new Date().toISOString(),
  };
}

const failures: QAFailure[] = [
  {
    id: "fail-001",
    workflow: "gda-opportunities",
    action: "qualify-write",
    errorCode: "WRITES_DISABLED",
    errorMessage:
      "QUALIFY_WRITES_ENABLED is false. Write blocked by safety gate.",
    occurredAt: "2026-05-09T14:22:00Z",
    resolved: false,
  },
  {
    id: "fail-002",
    workflow: "gda-ingest",
    action: "sam-gov-pull",
    errorCode: "UPSTREAM_TIMEOUT",
    errorMessage: "SAM.gov API timed out after 30s during opportunity ingest.",
    occurredAt: "2026-05-09T08:15:00Z",
    resolved: true,
  },
  {
    id: "fail-003",
    workflow: "gda-risk-register",
    action: "risk-sync",
    errorCode: "SCHEMA_MISMATCH",
    errorMessage:
      "Risk register response missing required field 'mitigationPlan'.",
    occurredAt: "2026-05-08T19:45:00Z",
    resolved: false,
  },
  {
    id: "fail-004",
    workflow: "gda-doctrine",
    action: "draft-publish",
    errorCode: "GATE_CHECK_FAILED",
    errorMessage:
      "Finalization blocked: QA Center dry-run check returned failure.",
    occurredAt: "2026-05-08T11:30:00Z",
    resolved: false,
  },
  {
    id: "fail-005",
    workflow: "gda-competitive-intel",
    action: "competitor-scan",
    errorCode: "RATE_LIMITED",
    errorMessage: "External API rate limit exceeded. Retry after 60s.",
    occurredAt: "2026-05-07T22:10:00Z",
    resolved: true,
  },
];

export function getLatestFailures(): QAFailure[] {
  return failures;
}
