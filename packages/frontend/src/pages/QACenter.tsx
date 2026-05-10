import { useEffect, useState } from "react";
import {
  fetchQAHealth,
  fetchQALatestFailures,
  type QAHealthData,
  type QAFailure,
} from "../api/client";

export default function QACenter() {
  const [health, setHealth] = useState<QAHealthData | null>(null);
  const [failures, setFailures] = useState<QAFailure[]>([]);
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
      if (healthRes.success && healthRes.data) setHealth(healthRes.data);
      if (failuresRes.success && failuresRes.data)
        setFailures(failuresRes.data.failures);
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
            {failures.filter((f) => !f.resolved).length} unresolved
          </span>
        </h2>
        {failures.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>
            No recent failures recorded.
          </p>
        ) : (
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
                      {new Date(f.occurredAt).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <StatusPill resolved={f.resolved} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function HealthPanel({ health }: { health: QAHealthData }) {
  const statusColors: Record<string, string> = {
    healthy: "var(--color-success)",
    degraded: "var(--color-warning)",
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
          background: statusColors[health.status] ?? "gray",
        }} />
        <span style={{ fontSize: 16, fontWeight: 600, textTransform: "capitalize" }}>
          {health.status}
        </span>
        <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          {health.platform} — checked{" "}
          {new Date(health.checkedAt).toLocaleTimeString()}
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 8,
      }}>
        {health.checks.map((check) => (
          <div
            key={check.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <CheckIcon status={check.status} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{check.name}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {check.message}
              </div>
            </div>
            <span style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
            }}>
              {check.durationMs}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckIcon({ status }: { status: "pass" | "fail" | "warn" }) {
  const colors: Record<string, string> = {
    pass: "var(--color-success)",
    fail: "var(--color-danger)",
    warn: "var(--color-warning)",
  };
  return (
    <span style={{
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: colors[status],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 700,
      color: "#000",
      flexShrink: 0,
    }}>
      {status === "pass" ? "P" : status === "fail" ? "F" : "W"}
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
