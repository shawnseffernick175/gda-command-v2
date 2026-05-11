import { useEffect, useState } from "react";
import {
  fetchSettings,
  fetchGatewayHealth,
  fetchBackupStatus,
  createBackup,
  type SettingsData,
  type ConnectorStatus,
  type FeatureFlag,
  type GatewayHealthData,
  type BackupStatusData,
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
  const [backupStatus, setBackupStatus] = useState<BackupStatusData | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);

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
      fetchBackupStatus()
        .then((env) => {
          if (env.success && env.data) setBackupStatus(env.data);
        })
        .catch(() => { /* backup endpoint may not exist yet */ }),
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

  async function triggerBackup() {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const env = await createBackup();
      if (env.success && env.data) {
        setBackupResult(`Backup created: ${env.data.filename} (${env.data.sizeKB} KB)`);
        // Refresh status
        const status = await fetchBackupStatus();
        if (status.success && status.data) setBackupStatus(status.data);
      } else {
        setBackupResult(`Backup failed: ${env.error?.message}`);
      }
    } catch (err) {
      setBackupResult(`Backup error: ${(err as Error).message}`);
    } finally {
      setBackupLoading(false);
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

      {/* Webhook Registry */}
      {settings?.webhookRegistry && (
        <Section title="n8n Webhook Registry">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <InfoCard label="Total Webhooks" value={String(settings.webhookRegistry.total)} />
            <InfoCard label="Live" value={String(settings.webhookRegistry.live)} color="#22c55e" />
            <InfoCard label="Exists (needs config)" value={String(settings.webhookRegistry.exists)} color="#f59e0b" />
            <InfoCard label="Planned" value={String(settings.webhookRegistry.planned)} color="#6b7280" />
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Live webhooks return real data from n8n. "Exists" webhooks have n8n workflows but need internal configuration.
            View full registry at <code style={{ fontSize: 12, background: "var(--color-surface)", padding: "2px 6px", borderRadius: 4 }}>/api/webhooks/registry</code>
          </div>
        </Section>
      )}

      {/* Database Backup Management */}
      <Section title="Database Backups">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          {backupStatus ? (
            <>
              <InfoCard label="Database Size" value={backupStatus.database.size} />
              <InfoCard label="Tables" value={String(backupStatus.database.tables)} />
              <InfoCard label="Total Rows" value={backupStatus.database.totalRows.toLocaleString()} />
              <InfoCard label="Daily Backups" value={String(backupStatus.backups.daily.length)} color={backupStatus.backups.daily.length > 0 ? "#22c55e" : "#f59e0b"} />
              <InfoCard label="Weekly Backups" value={String(backupStatus.backups.weekly.length)} color={backupStatus.backups.weekly.length > 0 ? "#22c55e" : "#6b7280"} />
            </>
          ) : (
            <InfoCard label="Status" value="Not available" color="#6b7280" />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <button
            onClick={triggerBackup}
            disabled={backupLoading}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #22c55e",
              background: "rgba(34,197,94,0.1)",
              color: "#22c55e",
              fontSize: 14,
              fontWeight: 600,
              cursor: backupLoading ? "wait" : "pointer",
              opacity: backupLoading ? 0.6 : 1,
            }}
          >
            {backupLoading ? "Creating Backup..." : "Create Backup Now"}
          </button>
          {backupResult && (
            <span style={{ fontSize: 13, color: backupResult.includes("error") || backupResult.includes("failed") ? "#ef4444" : "#22c55e" }}>
              {backupResult}
            </span>
          )}
        </div>

        {backupStatus && backupStatus.backups.daily.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--color-text-muted)" }}>Recent Daily Backups</div>
            <div style={{ fontSize: 13, fontFamily: "monospace", lineHeight: 1.8 }}>
              {backupStatus.backups.daily.slice(0, 7).map((b) => (
                <div key={b} style={{ color: "var(--color-text-muted)" }}>{b}</div>
              ))}
            </div>
          </div>
        )}

        {backupStatus && backupStatus.backups.weekly.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--color-text-muted)" }}>Weekly Backups</div>
            <div style={{ fontSize: 13, fontFamily: "monospace", lineHeight: 1.8 }}>
              {backupStatus.backups.weekly.map((b) => (
                <div key={b} style={{ color: "var(--color-text-muted)" }}>{b}</div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Automated backups run daily at 2:00 AM. Retention: 7 daily + 4 weekly.
          Use <code style={{ fontSize: 12, background: "var(--color-surface)", padding: "2px 6px", borderRadius: 4 }}>npm run db:backup</code> for CLI backups
          or <code style={{ fontSize: 12, background: "var(--color-surface)", padding: "2px 6px", borderRadius: 4 }}>npm run db:restore &lt;file&gt;</code> to restore.
        </div>
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
  { method: "GET", path: "/api/intel/research", description: "Deep research reports (n8n live)" },
  { method: "GET", path: "/api/intel/research/:id", description: "Single research report (n8n live)" },
  { method: "GET", path: "/api/intel/competitors", description: "Competitor profiles (n8n live)" },
  { method: "GET", path: "/api/capture/plans", description: "Capture plans" },
  { method: "GET", path: "/api/capture/plans/:id", description: "Single capture plan detail" },
  { method: "GET", path: "/api/capture/activities", description: "BD activity log" },
  { method: "POST", path: "/api/capture/gate-review", description: "Gate review dry-run" },
  { method: "GET", path: "/api/financials/kpis", description: "Financial KPIs strip data" },
  { method: "GET", path: "/api/financials/:key", description: "Financial Bible drill-down" },
  { method: "GET", path: "/api/prompts", description: "Prompt library with filtering" },
  { method: "GET", path: "/api/prompts/usage", description: "Recent prompt usage log" },
  { method: "GET", path: "/api/prompts/:id", description: "Prompt detail with versions & usage" },
  { method: "GET", path: "/api/workflows/registry", description: "n8n workflow registry" },
  { method: "GET", path: "/api/approvals", description: "Approvals queue with filters" },
  { method: "POST", path: "/api/approvals/:id/resolve", description: "Approve/reject dry-run" },
  { method: "GET", path: "/api/compliance/requirements", description: "Compliance requirements" },
  { method: "GET", path: "/api/compliance/clauses", description: "Clause library" },
  { method: "GET", path: "/api/compliance/clauses/:id", description: "Single clause detail" },
  { method: "GET", path: "/api/proposals", description: "Proposal list with filters" },
  { method: "GET", path: "/api/proposals/:id", description: "Single proposal detail" },
  { method: "GET", path: "/api/settings", description: "System settings and config" },
  { method: "GET", path: "/api/webhooks/registry", description: "n8n webhook registry (all paths + status)" },
  { method: "GET", path: "/api/dashboard/mega", description: "Combined dashboard data from n8n (live)" },
  { method: "GET", path: "/api/dashboard/trends", description: "Daily trend metrics from n8n (live)" },
  { method: "GET", path: "/api/dashboard/actions", description: "Daily action items from n8n (live)" },
  { method: "POST", path: "/api/ingest/opportunities", description: "Upsert opportunities (n8n push)" },
  { method: "POST", path: "/api/ingest/competitors", description: "Upsert competitor profiles (n8n push)" },
  { method: "POST", path: "/api/ingest/intel", description: "Push intel feed items (n8n push)" },
  { method: "POST", path: "/api/ingest/sam-opportunities", description: "SAM.gov opportunity upsert (n8n push)" },
  { method: "POST", path: "/api/ingest/fpds-awards", description: "FPDS award data (n8n push)" },
  { method: "GET", path: "/api/ingest/status", description: "Ingestion health + record counts" },
  { method: "GET", path: "/api/backup/status", description: "Backup status, DB size, backup files" },
  { method: "POST", path: "/api/backup/create", description: "Trigger on-demand database backup" },
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
