import { useEffect, useState } from "react";
import {
  fetchSettings,
  fetchGatewayHealth,
  type SettingsData,
  type ConnectorStatus,
  type FeatureFlag,
  type GatewayHealthData,
} from "../api/client";

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [health, setHealth] = useState<GatewayHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchSettings()
        .then((env) => {
          if (env.success && env.data) setSettings(env.data);
          else setError(env.error?.message ?? "Failed to load settings");
        }),
      fetchGatewayHealth()
        .then((env) => {
          if (env.success && env.data) setHealth(env.data);
        }),
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function runHealthCheck() {
    setTesting(true);
    setTestResult(null);
    try {
      const start = Date.now();
      const env = await fetchGatewayHealth();
      const ms = Date.now() - start;
      if (env.success && env.data) {
        setHealth(env.data);
        setTestResult(`Gateway responded in ${ms}ms — status: ${env.data.status}`);
      } else {
        setTestResult(`Health check failed: ${env.error?.message}`);
      }
    } catch (err) {
      setTestResult(`Connection error: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
        Loading settings...
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#ef4444" }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      {/* Environment info */}
      {settings && (
        <Section title="Environment">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <InfoCard label="Node.js" value={settings.environment.nodeVersion} />
            <InfoCard label="Uptime" value={formatUptime(settings.environment.uptimeSec)} />
            <InfoCard label="PID" value={String(settings.environment.pid)} />
            <InfoCard label="Port" value={settings.environment.port} />
            <InfoCard label="Environment" value={settings.environment.env} />
          </div>
        </Section>
      )}

      {/* Connectors */}
      {settings && (
        <Section title="Connectors">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {settings.connectors.map((c) => (
              <ConnectorCard key={c.name} connector={c} />
            ))}
          </div>
        </Section>
      )}

      {/* Feature flags */}
      {settings && (
        <Section title="Feature Flags">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {settings.featureFlags.map((f) => (
              <FlagCard key={f.key} flag={f} />
            ))}
          </div>
        </Section>
      )}

      {/* Gateway health check */}
      <Section title="Gateway Health">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <button
            onClick={runHealthCheck}
            disabled={testing}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "rgba(59,130,246,0.1)",
              color: "var(--color-primary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: testing ? "wait" : "pointer",
              opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? "Testing..." : "Run Health Check"}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {testResult}
            </span>
          )}
        </div>
        {health && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <InfoCard label="Status" value={health.status} color={health.status === "ok" ? "#22c55e" : "#ef4444"} />
            <InfoCard label="Webhook" value={health.config.webhookConfigured ? "Connected" : "Not configured"} color={health.config.webhookConfigured ? "#22c55e" : "#f59e0b"} />
            <InfoCard label="n8n API" value={health.config.apiConfigured ? "Connected" : "Not configured"} color={health.config.apiConfigured ? "#22c55e" : "#f59e0b"} />
            <InfoCard label="Database" value={health.config.dbConfigured ? (health.db?.ok ? `OK (${health.db.latencyMs}ms)` : "Error") : "Not configured"} color={health.config.dbConfigured ? (health.db?.ok ? "#22c55e" : "#ef4444") : "#f59e0b"} />
          </div>
        )}
      </Section>

      {/* API Endpoints Reference */}
      <Section title="API Endpoints">
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--color-surface)" }}>
                <th style={thStyle}>Method</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Endpoint</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((ep) => (
                <tr key={ep.path} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 14px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 700,
                        fontFamily: "monospace",
                        background: ep.method === "GET" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                        color: ep.method === "GET" ? "#22c55e" : "#f59e0b",
                      }}
                    >
                      {ep.method}
                    </span>
                  </td>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 13 }}>{ep.path}</td>
                  <td style={{ padding: "8px 14px", color: "var(--color-text-muted)" }}>{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "var(--color-text-muted)",
  borderBottom: "1px solid var(--color-border)",
};

const ENDPOINTS = [
  { method: "GET", path: "/health", description: "Gateway liveness and config status" },
  { method: "GET", path: "/api/qa/health", description: "Platform health checks" },
  { method: "GET", path: "/api/qa/latest-failures", description: "Recent workflow failures" },
  { method: "GET", path: "/api/opportunities", description: "List all opportunities" },
  { method: "GET", path: "/api/opportunities/pipeline", description: "Pipeline opportunities only" },
  { method: "GET", path: "/api/opportunities/:id/detail", description: "Opportunity detail with OODA" },
  { method: "POST", path: "/api/opportunities/:id/qualify", description: "Qualify dry-run / write" },
  { method: "GET", path: "/api/dashboard/kpis", description: "Dashboard KPIs and funnel" },
  { method: "GET", path: "/api/doctrine/drafts", description: "List doctrine drafts" },
  { method: "GET", path: "/api/doctrine/drafts/:id", description: "Single doctrine draft detail" },
  { method: "GET", path: "/api/doctrine/publish-runs", description: "Publish run history" },
  { method: "POST", path: "/api/doctrine/finalize", description: "Trigger sprint finalization" },
  { method: "GET", path: "/api/intel/feed", description: "Intelligence feed items" },
  { method: "GET", path: "/api/intel/briefings", description: "Morning briefings" },
  { method: "GET", path: "/api/intel/briefings/:id", description: "Single briefing detail" },
  { method: "GET", path: "/api/intel/research", description: "Deep research reports" },
  { method: "GET", path: "/api/intel/research/:id", description: "Single research report" },
  { method: "GET", path: "/api/intel/competitors", description: "Competitor profiles" },
  { method: "GET", path: "/api/capture/plans", description: "Capture plans" },
  { method: "GET", path: "/api/capture/plans/:id", description: "Single capture plan detail" },
  { method: "GET", path: "/api/capture/activities", description: "BD activity log" },
  { method: "POST", path: "/api/capture/gate-review", description: "Gate review dry-run" },
  { method: "GET", path: "/api/financials/kpis", description: "Financial KPIs strip data" },
  { method: "GET", path: "/api/financials/:key", description: "Financial Bible drill-down" },
  { method: "GET", path: "/api/workflows/registry", description: "n8n workflow registry" },
  { method: "GET", path: "/api/settings", description: "System settings and config" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14, color: "var(--color-text)" }}>{title}</h2>
      {children}
    </div>
  );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "12px 16px",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function ConnectorCard({ connector: c }: { connector: ConnectorStatus }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "14px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{c.name}</div>
        {!c.configured && c.missing.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Missing: {c.missing.join(", ")}
          </div>
        )}
        {c.latencyMs !== undefined && (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Latency: {c.latencyMs}ms
          </div>
        )}
        {c.error && (
          <div style={{ fontSize: 12, color: "#ef4444" }}>
            Error: {c.error}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 12,
          padding: "4px 12px",
          borderRadius: 12,
          fontWeight: 600,
          background: c.configured ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
          color: c.configured ? "#22c55e" : "#f59e0b",
        }}
      >
        {c.configured ? "Connected" : "Not configured"}
      </span>
    </div>
  );
}

function FlagCard({ flag: f }: { flag: FeatureFlag }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "14px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{f.label}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{f.description}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace", marginTop: 4 }}>
          {f.key}
        </div>
      </div>
      <span
        style={{
          fontSize: 12,
          padding: "4px 12px",
          borderRadius: 12,
          fontWeight: 600,
          background: f.enabled ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)",
          color: f.enabled ? "#22c55e" : "#6b7280",
        }}
      >
        {f.enabled ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}
