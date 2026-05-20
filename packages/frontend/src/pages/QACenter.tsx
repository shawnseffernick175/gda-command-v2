import { useEffect, useState } from "react";
import {
  fetchQAHealth,
  fetchQALatestFailures,
  fetchSAMVerify,
  fetchSourceHealth,
  triggerControlledFix,
  fetchPendingFixes,
  resolveFixProposal as resolveFixProposalApi,
  type QAHealthData,
  type QAFailure,
  type QACheckRow,
  type FixProposalItem,
  type ControlledFixResult,
  type SAMVerifyData,
  type SAMVerifyRun,
  type SourceHealthData,
  type SourceHealthItem,
  type SourceHealthSnapshot,
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
  const [samVerify, setSamVerify] = useState<SAMVerifyData | null>(null);
  const [sourceHealth, setSourceHealth] = useState<SourceHealthData | null>(null);

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

      try {
        const samRes = await fetchSAMVerify();
        if (samRes.success && samRes.data) setSamVerify(samRes.data);
      } catch { /* sam-verify table may not exist yet */ }

      try {
        const shRes = await fetchSourceHealth();
        if (shRes.success && shRes.data) setSourceHealth(shRes.data);
      } catch { /* source-health endpoint may not exist yet */ }
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
            {source === "live" ? "Live API" : "Live DB"}
          </span>
        )}
      </div>

      {sourceHealth && <SourceStatusStrip data={sourceHealth} />}

      {health && <HealthPanel health={health} />}

      {samVerify && <SAMVerifyPanel data={samVerify} />}

      {sourceHealth && <SourceHealthPanel data={sourceHealth} />}

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

function SAMVerifyPanel({ data }: { data: SAMVerifyData }) {
  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    operational: { bg: "rgba(34,197,94,0.15)", color: "var(--color-success)", label: "Operational" },
    degraded: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Degraded" },
    error: { bg: "rgba(239,68,68,0.15)", color: "var(--color-danger)", label: "Error" },
    unknown: { bg: "rgba(107,114,128,0.15)", color: "var(--color-text-muted)", label: "No Data" },
  };
  const s = statusColors[data.overall] ?? statusColors.unknown;

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: 20,
      marginTop: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color }} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>SAM Sync Verification</span>
        <span style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          background: s.bg,
          color: s.color,
          fontWeight: 500,
        }}>
          {s.label}
        </span>
      </div>

      {data.latest ? (
        <SAMVerifyRunCard run={data.latest} />
      ) : (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          No verification runs recorded yet. First run triggers 30s after server startup.
        </p>
      )}

      {data.history.length > 1 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ fontSize: 13, fontWeight: 500, cursor: "pointer", color: "var(--color-text-muted)" }}>
            Previous runs ({data.history.length - 1})
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {data.history.slice(1).map((run) => (
              <SAMVerifyRunCard key={run.id} run={run} compact />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SAMVerifyRunCard({ run, compact }: { run: SAMVerifyRun; compact?: boolean }) {
  const statusStyle: Record<string, { bg: string; color: string }> = {
    pass: { bg: "rgba(34,197,94,0.15)", color: "var(--color-success)" },
    fail: { bg: "rgba(239,68,68,0.15)", color: "var(--color-danger)" },
    error: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  };
  const st = statusStyle[run.status] ?? statusStyle.error;

  return (
    <div style={{
      padding: compact ? "8px 12px" : "12px 16px",
      borderRadius: 6,
      background: "var(--color-bg)",
      border: "1px solid var(--color-border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: compact ? 4 : 8 }}>
        <span style={{
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          background: st.bg,
          color: st.color,
          textTransform: "uppercase",
        }}>
          {run.status}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {new Date(run.ran_at).toLocaleString()}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
          {run.duration_ms}ms
        </span>
      </div>

      {run.status === "error" ? (
        <p style={{ fontSize: 13, color: "var(--color-danger)" }}>
          {run.error_message ?? "Unknown error"}
        </p>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: compact ? "repeat(auto-fill, minmax(140px, 1fr))" : "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
          fontSize: 13,
        }}>
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>SAM Count</div>
            <div style={{ fontWeight: 500 }}>{run.sam_count.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>DB Before</div>
            <div style={{ fontWeight: 500 }}>{run.db_count_before.toLocaleString()}</div>
          </div>
          {run.db_count_after !== null && (
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>DB After</div>
              <div style={{ fontWeight: 500 }}>{run.db_count_after.toLocaleString()}</div>
            </div>
          )}
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Gap Before</div>
            <div style={{ fontWeight: 500, color: run.gap_before_pct > 1 ? "var(--color-danger)" : "var(--color-success)" }}>
              {run.gap_before_pct.toFixed(1)}%
            </div>
          </div>
          {run.gap_after_pct !== null && (
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Gap After</div>
              <div style={{ fontWeight: 500, color: run.gap_after_pct > 1 ? "var(--color-danger)" : "var(--color-success)" }}>
                {run.gap_after_pct.toFixed(1)}%
              </div>
            </div>
          )}
          {run.backfill_ran && (
            <>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Backfill Fetched</div>
                <div style={{ fontWeight: 500 }}>{(run.backfill_fetched ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Backfill Upserted</div>
                <div style={{ fontWeight: 500 }}>{(run.backfill_upserted ?? 0).toLocaleString()}</div>
              </div>
            </>
          )}
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Days Checked</div>
            <div style={{ fontWeight: 500 }}>{run.days_checked}</div>
          </div>
        </div>
      )}
    </div>
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

// ---------------------------------------------------------------------------
// Source Status Strip — top-level overview of all opportunity trackers
// ---------------------------------------------------------------------------
const SOURCE_DISPLAY: Record<string, { label: string; roleLabel: string }> = {
  sam_gov: { label: "SAM.gov", roleLabel: "Primary Discovery" },
  usaspending: { label: "USAspending", roleLabel: "Enrichment" },
  fpds: { label: "FPDS", roleLabel: "Enrichment" },
  govtribe: { label: "GovTribe", roleLabel: "Primary Discovery" },
  govtribe_zapier: { label: "GovTribe", roleLabel: "Primary Discovery" },
  govwin: { label: "GovWin", roleLabel: "Primary Discovery" },
};

const OVERALL_STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  all_healthy: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "All Sources Healthy" },
  degraded: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Sources Degraded" },
  critical: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Sources Critical" },
  unknown: { bg: "rgba(107,114,128,0.15)", color: "#6b7280", label: "No Snapshot Data" },
};

const STRIP_STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  error: "#ef4444",
  deprecated: "#6b7280",
  planned: "#9ca3af",
  missing_key: "#f97316",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SourceStatusStrip({ data }: { data: SourceHealthData }) {
  const snapshots = data.latest_snapshots ?? [];
  const overallStatus = data.overall_status ?? "unknown";
  const config = OVERALL_STATUS_CONFIG[overallStatus] ?? OVERALL_STATUS_CONFIG.unknown;

  // Merge snapshots with source feed data to show 5 cards
  // Collapse govtribe + govtribe_zapier into one "GovTribe" card
  const displaySources = ["sam_gov", "usaspending", "fpds", "govtribe", "govwin"];

  const cardData = displaySources.map((src) => {
    // For govtribe, prefer govtribe_zapier snapshot (active ingest feed) over govtribe
    const snap = src === "govtribe"
      ? (snapshots.find((s: SourceHealthSnapshot) => s.source === "govtribe_zapier")
        ?? snapshots.find((s: SourceHealthSnapshot) => s.source === "govtribe"))
      : snapshots.find((s: SourceHealthSnapshot) => s.source === src);
    const feed = src === "govtribe"
      ? (data.sources.find((s: SourceHealthItem) => s.source === "govtribe_zapier")
        ?? data.sources.find((s: SourceHealthItem) => s.source === "govtribe"))
      : data.sources.find((s: SourceHealthItem) => s.source === src);
    const display = SOURCE_DISPLAY[src] ?? { label: src, roleLabel: "Unknown" };

    return {
      source: src,
      label: display.label,
      roleLabel: snap?.role === "enrichment" ? "Enrichment" : display.roleLabel,
      status: snap?.status ?? feed?.status ?? "planned",
      lastRecordAt: snap?.last_record_at ?? feed?.last_sync_at ?? null,
      recordsThisWeek: snap?.records_last_7d ?? null,
      callsThisWeek: snap?.calls_last_7d ?? null,
      role: snap?.role ?? (["usaspending", "fpds"].includes(src) ? "enrichment" : "primary"),
      statusReason: snap?.status_reason ?? null,
      meta: snap?.meta ?? {},
    };
  });

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Overall status pill */}
      <div style={{ marginBottom: 12 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 20,
          background: config.bg,
          color: config.color,
          fontSize: 13,
          fontWeight: 600,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: config.color }} />
          {config.label}
        </span>
      </div>

      {/* Source cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 12,
      }}>
        {cardData.map((card) => (
          <SourceCard key={card.source} card={card} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ card }: {
  card: {
    source: string;
    label: string;
    roleLabel: string;
    status: string;
    lastRecordAt: string | null;
    recordsThisWeek: number | null;
    callsThisWeek: number | null;
    role: string;
    statusReason: string | null;
    meta: Record<string, unknown>;
  };
}) {
  const dotColor = STRIP_STATUS_COLORS[card.status] ?? "#6b7280";

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: "14px 16px",
      position: "relative",
      minHeight: 100,
    }}>
      {/* Status dot — top right */}
      <span style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: dotColor,
        boxShadow: card.status === "error" ? `0 0 6px ${dotColor}` : undefined,
      }} />

      {/* Source name */}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{card.label}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 10 }}>{card.roleLabel}</div>

      {/* Last data */}
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
        Last data: {timeAgo(card.lastRecordAt)}
      </div>

      {/* Records or calls this week */}
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
        {card.role === "enrichment"
          ? `${card.callsThisWeek ?? 0} calls this week`
          : `${card.recordsThisWeek ?? 0} records this week`}
      </div>

      {/* SAM verify gap */}
      {card.meta.verify_gap_pct != null && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Verify gap: {(card.meta.verify_gap_pct as number).toFixed(1)}%
        </div>
      )}

      {/* Status reason if not healthy */}
      {card.statusReason && (
        <div style={{
          fontSize: 11,
          color: dotColor,
          marginTop: 6,
          lineHeight: 1.3,
        }}>
          {card.statusReason}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Source Health Panel
// ---------------------------------------------------------------------------
const SOURCE_STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  error: "#ef4444",
  deprecated: "#6b7280",
  disabled: "#9ca3af",
  missing_key: "#f97316",
};

const SOURCE_STATUS_LABELS: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  error: "Error",
  deprecated: "Deprecated",
  disabled: "Disabled",
  missing_key: "Missing API Key",
};

function SourceHealthPanel({ data }: { data: SourceHealthData }) {
  const overallColor = data.overall === "operational" ? "#22c55e" : data.overall === "degraded" ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ marginTop: 24, background: "var(--color-surface)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Data Source Health</h3>
        <span style={{
          display: "inline-block", width: 10, height: 10, borderRadius: "50%",
          background: overallColor,
        }} />
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          {data.active} active · {data.deprecated} deprecated · {data.erroring} erroring
        </span>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Source</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Last Sync</th>
            <th style={thStyle}>Records</th>
            <th style={thStyle}>Errors</th>
            <th style={thStyle}>Details</th>
          </tr>
        </thead>
        <tbody>
          {data.sources.map((s: SourceHealthItem) => (
            <SourceHealthRow key={s.id} source={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceHealthRow({ source }: { source: SourceHealthItem }) {
  const color = SOURCE_STATUS_COLORS[source.status] ?? "#6b7280";
  const label = SOURCE_STATUS_LABELS[source.status] ?? source.status;

  return (
    <tr style={{ opacity: source.deprecated_at ? 0.6 : 1 }}>
      <td style={tdStyle}>
        <span style={{ fontWeight: 500 }}>{source.name}</span>
        <br />
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{source.source}</span>
      </td>
      <td style={tdStyle}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500,
          background: `${color}20`, color,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          {label}
        </span>
      </td>
      <td style={{ ...tdStyle, fontSize: 13 }}>
        {source.last_sync_at
          ? new Date(source.last_sync_at).toLocaleString()
          : <span style={{ color: "var(--color-text-muted)" }}>Never</span>}
      </td>
      <td style={{ ...tdStyle, fontSize: 13 }}>
        {source.last_sync_count}
      </td>
      <td style={{ ...tdStyle, fontSize: 13 }}>
        <span style={{ color: source.error_count > 0 ? "#ef4444" : "inherit" }}>
          {source.error_count}
        </span>
      </td>
      <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)", maxWidth: 300 }}>
        {source.deprecation_reason
          ?? (source.status === "missing_key" ? "API key not configured in environment" : null)
          ?? (source.error_count > 3 ? "Consecutive failures — check API connectivity" : null)
          ?? "\u2014"}
      </td>
    </tr>
  );
}
