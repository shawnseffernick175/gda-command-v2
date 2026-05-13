import { useEffect, useState } from "react";
import {
  fetchQAHealth,
  fetchQALatestFailures,
  triggerControlledFix,
  fetchPendingFixes,
  resolveFixProposal as resolveFixProposalApi,
  type QAHealthData,
  type QAFailure,
  type QACheckRow,
  type FixProposalItem,
  type ControlledFixResult,
} from "../api/client";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

const FIX_TYPE_LABELS: Record<string, string> = {
  auto: "Auto-fix",
  manual: "Manual",
  restart: "Restart",
  config_change: "Config Change",
};

export default function QACenter() {
  const [health, setHealth] = useState<QAHealthData | null>(null);
  const [failures, setFailures] = useState<QAFailure[]>([]);
  const [source, setSource] = useState<"db" | "live" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<ControlledFixResult | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [fixes, setFixes] = useState<FixProposalItem[]>([]);
  const [fixesLoading, setFixesLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedFix, setExpandedFix] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, failuresRes] = await Promise.all([
        fetchQAHealth(),
        fetchQALatestFailures(),
      ]);
      if (healthRes.success && healthRes.data) {
        setHealth(healthRes.data);
        setSource(healthRes.data.source ?? null);
      }
      if (failuresRes.success && failuresRes.data)
        setFailures(failuresRes.data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadFixes() {
    setFixesLoading(true);
    try {
      const res = await fetchPendingFixes();
      if (res.success && res.data) setFixes(res.data.fixes);
    } catch {
      // silent — fixes section is supplementary
    } finally {
      setFixesLoading(false);
    }
  }

  async function handleDiagnose() {
    setDiagnosing(true);
    setDiagResult(null);
    setDiagError(null);
    try {
      const res = await triggerControlledFix();
      if (res.success && res.data) {
        setDiagResult(res.data);
        loadFixes();
      } else {
        setDiagError(res.error?.message ?? "Diagnosis failed");
      }
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "Diagnosis failed");
    } finally {
      setDiagnosing(false);
    }
  }

  async function handleResolve(id: string, action: "approve" | "reject") {
    setResolvingId(id);
    try {
      await resolveFixProposalApi(id, action);
      loadFixes();
    } catch {
      // silent
    } finally {
      setResolvingId(null);
    }
  }

  useEffect(() => {
    load();
    loadFixes();
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>QA Center</h1>
        <button onClick={load} style={refreshButtonStyle}>
          Refresh
        </button>
        {source && (
          <span style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            background: source === "live" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
            color: source === "live" ? "var(--color-success)" : "var(--color-accent, #3b82f6)",
            fontWeight: 500,
          }}>
            {source === "live" ? "Live n8n" : "Live DB"}
          </span>
        )}
      </div>

      {health && <HealthPanel health={health} />}

      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            Latest Failures
            <span style={{
              marginLeft: 8,
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500,
              background: "rgba(239,68,68,0.15)",
              color: "var(--color-danger)",
            }}>
              {failures.length} total
            </span>
          </h2>
          <button
            onClick={handleDiagnose}
            disabled={diagnosing}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              background: diagnosing
                ? "rgba(107,114,128,0.3)"
                : "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: diagnosing ? "not-allowed" : "pointer",
            }}
          >
            {diagnosing ? "Diagnosing Failures..." : "Diagnose Failures"}
          </button>
        </div>

        {diagResult && (
          <div style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 12,
            background: diagResult.summary.new_failures === 0
              ? "rgba(59,130,246,0.12)"
              : "rgba(34,197,94,0.12)",
            color: diagResult.summary.new_failures === 0
              ? "var(--color-accent, #3b82f6)"
              : "var(--color-success)",
            fontSize: 13,
          }}>
            {diagResult.summary.new_failures === 0
              ? `Scanned ${diagResult.summary.total_failures} failures — no new issues to diagnose`
              : `Diagnosed ${diagResult.summary.new_failures} new failures — ${diagResult.summary.proposals_created} fix proposals created, ${diagResult.summary.approvals_queued} queued for approval`
            }
          </div>
        )}
        {diagError && (
          <div style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 12,
            background: "rgba(239,68,68,0.12)",
            color: "var(--color-danger)",
            fontSize: 13,
          }}>
            {diagError}
          </div>
        )}

        {failures.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>
            No recent failures recorded.
          </p>
        ) : source === "live" ? (
          <LiveFailuresTable failures={failures} />
        ) : (
          <MockFailuresTable failures={failures} />
        )}
      </div>

      {/* Fix Proposals Section */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Fix Proposals
          <span style={{
            marginLeft: 8,
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 500,
            background: fixes.length > 0 ? "rgba(245,158,11,0.15)" : "rgba(107,114,128,0.15)",
            color: fixes.length > 0 ? "#f59e0b" : "var(--color-text-muted)",
          }}>
            {fixes.length} pending
          </span>
        </h2>

        {fixesLoading ? (
          <p style={{ color: "var(--color-text-muted)" }}>Loading fix proposals...</p>
        ) : fixes.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>
            No pending fix proposals. Click "Diagnose Failures" to scan for issues.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {fixes.map((fix) => (
              <div
                key={fix.id}
                style={{
                  background: "var(--color-surface, #1e293b)",
                  borderRadius: 8,
                  padding: "16px 20px",
                  border: `1px solid ${SEVERITY_COLORS[fix.severity] ?? "#374151"}30`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: `${SEVERITY_COLORS[fix.severity] ?? "#6b7280"}20`,
                        color: SEVERITY_COLORS[fix.severity] ?? "#6b7280",
                        textTransform: "uppercase",
                      }}>
                        {fix.severity}
                      </span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        background: "rgba(107,114,128,0.15)",
                        color: "var(--color-text-muted)",
                      }}>
                        {FIX_TYPE_LABELS[fix.fix_type] ?? fix.fix_type}
                      </span>
                      {fix.auto_fixable && (
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: "rgba(34,197,94,0.15)",
                          color: "var(--color-success)",
                        }}>
                          Auto-fixable
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                      {fix.workflow_name}
                      {fix.failed_node && (
                        <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>
                          {" "}→ {fix.failed_node}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 6 }}>
                      {fix.error_message}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                      <strong>Root cause:</strong> {fix.root_cause}
                    </div>

                    {expandedFix === fix.id && (
                      <div style={{ marginTop: 12, fontSize: 13 }}>
                        <div style={{ marginBottom: 8 }}>
                          <strong>Suggested Fix:</strong>
                          <div style={{ marginTop: 4, padding: "8px 12px", background: "rgba(34,197,94,0.08)", borderRadius: 6 }}>
                            {fix.suggested_fix}
                          </div>
                        </div>
                        {fix.risk_assessment && (
                          <div style={{ marginBottom: 8 }}>
                            <strong>Risk:</strong>
                            <div style={{ marginTop: 4, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                              {fix.risk_assessment}
                            </div>
                          </div>
                        )}
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Safety lane: <code>{fix.safety_lane}</code> | Created: {new Date(fix.created_at).toLocaleString()}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setExpandedFix(expandedFix === fix.id ? null : fix.id)}
                      style={{ background: "none", border: "none", color: "var(--color-accent, #3b82f6)", cursor: "pointer", padding: 0, marginTop: 6, fontSize: 12 }}
                    >
                      {expandedFix === fix.id ? "Hide details" : "Show details"}
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
                    <button
                      onClick={() => handleResolve(fix.id, "approve")}
                      disabled={resolvingId === fix.id}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "rgba(34,197,94,0.2)",
                        color: "var(--color-success)",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: resolvingId === fix.id ? "not-allowed" : "pointer",
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleResolve(fix.id, "reject")}
                      disabled={resolvingId === fix.id}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "rgba(239,68,68,0.2)",
                        color: "var(--color-danger)",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: resolvingId === fix.id ? "not-allowed" : "pointer",
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveFailuresTable({ failures }: { failures: QAFailure[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Workflow</th>
            <th style={thStyle}>Failed Node</th>
            <th style={thStyle}>Message</th>
            <th style={thStyle}>Started</th>
            <th style={thStyle}>Stopped</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((f, i) => (
            <tr key={f.id ?? i}>
              <td style={tdStyle}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                  {f.workflowName ?? f.workflow ?? "—"}
                </code>
                {f.workflowId && (
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {f.workflowId}
                  </div>
                )}
              </td>
              <td style={tdStyle}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-danger)" }}>
                  {f.failedNode ?? "—"}
                </code>
              </td>
              <td style={{ ...tdStyle, maxWidth: 400 }}>
                {f.message ?? f.errorMessage ?? "—"}
              </td>
              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                {f.startedAt ? new Date(f.startedAt).toLocaleString() : "—"}
              </td>
              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                {f.stoppedAt ? new Date(f.stoppedAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MockFailuresTable({ failures }: { failures: QAFailure[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Workflow</th>
            <th style={thStyle}>Action</th>
            <th style={thStyle}>Error Code</th>
            <th style={thStyle}>Message</th>
            <th style={thStyle}>When</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((f) => (
            <tr key={f.id}>
              <td style={tdStyle}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                  {f.workflow}
                </code>
              </td>
              <td style={tdStyle}>{f.action}</td>
              <td style={tdStyle}>
                <code style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--color-danger)",
                }}>
                  {f.errorCode}
                </code>
              </td>
              <td style={{ ...tdStyle, maxWidth: 320 }}>{f.errorMessage}</td>
              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                {f.occurredAt ? new Date(f.occurredAt).toLocaleString() : "—"}
              </td>
              <td style={tdStyle}>
                <StatusPill resolved={f.resolved ?? false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthPanel({ health }: { health: QAHealthData }) {
  const statusColors: Record<string, string> = {
    healthy: "var(--color-success)",
    operational: "var(--color-success)",
    degraded: "var(--color-warning)",
    critical: "var(--color-danger)",
    down: "var(--color-danger)",
  };

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: statusColors[health.overall] ?? "gray",
        }} />
        <span style={{ fontSize: 16, fontWeight: 600, textTransform: "capitalize" }}>
          {health.overall}
        </span>
        <span style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          padding: "2px 8px",
          background: "var(--color-bg)",
          borderRadius: 4,
        }}>
          {health.summary.passed}/{health.summary.total} passed
          {(health.summary.authFails ?? 0) > 0 && ` · ${health.summary.authFails} auth fail`}
          {(health.summary.empty ?? 0) > 0 && ` · ${health.summary.empty} empty`}
        </span>
      </div>

      {health.nextAction && (
        <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          marginBottom: 16,
          padding: "8px 12px",
          background: "var(--color-bg)",
          borderRadius: 6,
          borderLeft: `3px solid ${statusColors[health.overall] ?? "gray"}`,
        }}>
          {health.nextAction}
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 8,
      }}>
        {health.rows.map((check, i) => (
          <CheckCard key={check.id ?? check.name ?? i} check={check} />
        ))}
      </div>
    </div>
  );
}

function CheckCard({ check }: { check: QACheckRow }) {
  const displayName = check.label ?? check.name ?? check.id ?? "Unknown";
  const displayStatus = check.status;
  const displayMs = check.ms ?? check.durationMs ?? null;
  const displayMessage = check.error ?? check.message ?? "";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      borderRadius: 6,
      background: "var(--color-bg)",
      border: "1px solid var(--color-border)",
    }}>
      <CheckIcon status={displayStatus} tone={check.tone} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{displayName}</div>
        {displayMessage && (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayMessage}
          </div>
        )}
        {check.http !== undefined && check.http > 0 && (
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            HTTP {check.http} · {check.bytes ?? 0} bytes
          </div>
        )}
      </div>
      {displayMs !== null && (
        <span style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-mono)",
          whiteSpace: "nowrap",
        }}>
          {displayMs}ms
        </span>
      )}
    </div>
  );
}

function CheckIcon({ status, tone }: { status: string; tone?: string }) {
  const toneColors: Record<string, string> = {
    green: "var(--color-success)",
    red: "var(--color-danger)",
    orange: "var(--color-warning)",
    gray: "#999",
  };
  const statusColors: Record<string, string> = {
    pass: "var(--color-success)",
    PASS: "var(--color-success)",
    fail: "var(--color-danger)",
    FAIL: "var(--color-danger)",
    ERROR: "var(--color-danger)",
    TIMEOUT: "var(--color-danger)",
    "AUTH FAIL": "var(--color-danger)",
    warn: "var(--color-warning)",
    EMPTY: "var(--color-warning)",
    "NOT CONFIGURED": "#999",
  };
  const color = (tone ? toneColors[tone] : null) ?? statusColors[status] ?? "#999";
  const letter = status === "pass" || status === "PASS" ? "P"
    : status === "EMPTY" ? "E"
    : status === "NOT CONFIGURED" ? "?"
    : status === "warn" ? "W"
    : "F";

  return (
    <span style={{
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 700,
      color: "#000",
      flexShrink: 0,
    }}>
      {letter}
    </span>
  );
}

function StatusPill({ resolved }: { resolved: boolean }) {
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 500,
      background: resolved ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
      color: resolved ? "var(--color-success)" : "var(--color-danger)",
    }}>
      {resolved ? "Resolved" : "Unresolved"}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>QA Center</h1>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 60,
            background: "var(--color-surface)",
            borderRadius: 8,
            marginBottom: 8,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div style={{
      padding: 20,
      background: "rgba(239,68,68,0.1)",
      border: "1px solid var(--color-danger)",
      borderRadius: 8,
    }}>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load QA data</p>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 12 }}>{message}</p>
      <button onClick={onRetry} style={refreshButtonStyle}>
        Retry
      </button>
    </div>
  );
}

const refreshButtonStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 13,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-muted)",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border)",
};
