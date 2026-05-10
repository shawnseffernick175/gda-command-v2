import { useEffect, useState } from "react";
import {
  fetchQAHealth,
  fetchQALatestFailures,
  type QAHealthData,
  type QAFailure,
  type QACheckRow,
} from "../api/client";

export default function QACenter() {
  const [health, setHealth] = useState<QAHealthData | null>(null);
  const [failures, setFailures] = useState<QAFailure[]>([]);
  const [source, setSource] = useState<"mock" | "live" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
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
            {source === "live" ? "Live n8n" : "Mock data"}
          </span>
        )}
      </div>

      {health && <HealthPanel health={health} />}

      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
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
