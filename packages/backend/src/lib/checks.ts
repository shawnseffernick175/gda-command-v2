/**
 * Approved QA checks. Mirrors the set used by the React QA Center.
 * Read-only set is idempotent.
 * Dry-run set hits write-capable workflows with dryRun:true and MUST NOT cause writes.
 */

export interface CheckDefinition {
  id: string;
  label: string;
  path: string;
  body: Record<string, unknown>;
}

export const READONLY_CHECKS: CheckDefinition[] = [
  { id: "platform-health",       label: "Platform Health",         path: "gda-platform-health",        body: {} },
  { id: "dashboard-mega",        label: "Dashboard (Mega)",        path: "gda-dashboard-mega",         body: {} },
  { id: "trends",                label: "Trends",                  path: "gda-trends",                 body: {} },
  { id: "opp-tracker",           label: "Opportunity Tracker",     path: "gda-opp-tracker",            body: {} },
  { id: "launchpad-funnel",      label: "Launchpad Funnel",        path: "gda-launchpad-funnel",       body: {} },
  { id: "deep-research-history", label: "Deep Research History",   path: "gda-deep-research-history",  body: { action: "list", limit: 1 } },
  { id: "capture-plan",          label: "Capture Plan",            path: "gda-capture-plan",           body: { action: "list", limit: 1 } },
  { id: "morning-briefing",      label: "Morning Briefing",        path: "gda-morning-briefing",       body: {} },
];

export const DRYRUN_CHECKS: CheckDefinition[] = [
  { id: "save-opp-dryrun", label: "Save Opportunity (dry run)", path: "gda-save-opp", body: { dryRun: true, opp: { title: "gateway dry-run probe", source: "api-gateway" } } },
  { id: "risk-dryrun",     label: "Risk Register (dry run)",    path: "gda-risk",     body: { dryRun: true, action: "analyze", target: "gateway-probe" } },
];

export function allowedDryRunIds(): string[] {
  return DRYRUN_CHECKS.map((c) => c.id);
}

export type CheckStatus = "PASS" | "FAIL" | "ERROR" | "TIMEOUT" | "AUTH FAIL" | "EMPTY" | "NOT CONFIGURED" | "UNKNOWN";
export type CheckTone = "green" | "red" | "orange" | "gray";

export interface Classification {
  status: CheckStatus;
  tone: CheckTone;
}

export function classify(
  httpStatus: number,
  parsedBody: unknown,
  errorReason: string | null
): Classification {
  if (errorReason === "not_configured") return { status: "NOT CONFIGURED", tone: "gray" };
  if (errorReason === "timeout") return { status: "TIMEOUT", tone: "red" };
  if (errorReason) return { status: "ERROR", tone: "red" };
  if (httpStatus === 401 || httpStatus === 403) return { status: "AUTH FAIL", tone: "red" };
  if (httpStatus >= 500) return { status: "FAIL", tone: "red" };
  if (httpStatus >= 400) return { status: "FAIL", tone: "red" };
  if (httpStatus >= 200 && httpStatus < 400) {
    const isEmpty =
      parsedBody === null ||
      parsedBody === undefined ||
      (Array.isArray(parsedBody) && parsedBody.length === 0) ||
      (typeof parsedBody === "object" && !Array.isArray(parsedBody) && Object.keys(parsedBody as object).length === 0);
    if (isEmpty) return { status: "EMPTY", tone: "orange" };
    if (
      parsedBody &&
      typeof parsedBody === "object" &&
      (parsedBody as Record<string, unknown>).success === false
    ) {
      return { status: "FAIL", tone: "red" };
    }
    return { status: "PASS", tone: "green" };
  }
  return { status: "UNKNOWN", tone: "gray" };
}

export interface CheckRow {
  id: string;
  label: string;
  path: string;
  http: number;
  ms: number;
  bytes: number;
  status: CheckStatus;
  tone: CheckTone;
  error: string | null;
}

export interface CheckSummary {
  total: number;
  passed: number;
  failed: number;
  authFails: number;
  empty: number;
  notConfigured: number;
}

export function summarize(rows: CheckRow[]): CheckSummary {
  return {
    total: rows.length,
    passed: rows.filter((r) => r.status === "PASS").length,
    failed: rows.filter((r) => r.status === "FAIL" || r.status === "ERROR" || r.status === "TIMEOUT").length,
    authFails: rows.filter((r) => r.status === "AUTH FAIL").length,
    empty: rows.filter((r) => r.status === "EMPTY").length,
    notConfigured: rows.filter((r) => r.status === "NOT CONFIGURED").length,
  };
}

export function recommend(rows: CheckRow[]): string {
  if (!rows || rows.length === 0) return "No checks have been run.";
  const auth = rows.filter((r) => r.status === "AUTH FAIL");
  const fails = rows.filter((r) => r.status === "FAIL" || r.status === "ERROR" || r.status === "TIMEOUT");
  const empties = rows.filter((r) => r.status === "EMPTY");
  const notCfg = rows.filter((r) => r.status === "NOT CONFIGURED");
  if (notCfg.length === rows.length) {
    return "Gateway is not configured for upstream calls. Set N8N_BASE_URL (and GDA_WEBHOOK_KEY if required) in .env.";
  }
  if (auth.length > 0) {
    return `Auth failure on ${auth.length} endpoint(s). The webhook key is missing or invalid on the server side. Do not put keys in React.`;
  }
  if (fails.length > 0) {
    return `${fails.length} endpoint(s) failing. The names below map to n8n workflow ids of the same name.`;
  }
  if (empties.length > 0) {
    return `${empties.length} endpoint(s) returned empty. Often safe but verify with the workflow owner.`;
  }
  return "All read-only checks passed.";
}
