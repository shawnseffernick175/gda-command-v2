import { useEffect, useState } from "react";
import { getUser } from "../api/auth";
import {
  fetchSettings,
  fetchGatewayHealth,
  fetchBackupStatus,
  createBackup,
  fetchFeedStatus,
  triggerFeedSync,
  fetchEmbeddingStats,
  triggerEmbedAll,
  fetchEmailStatus,
  fetchEmailPreferences,
  updateEmailPreferences,
  testSmtpConnection as apiTestSmtp,
  sendTestEmail,
  type SettingsData,
  type ConnectorStatus,
  type FeatureFlag,
  type GatewayHealthData,
  type BackupStatusData,
  type FeedStatusData,
  type FeedSyncData,
  type EmbeddingStatsData,
  type EmbedResult,
  type EmailStatusData,
  type EmailPreferencesData,
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
  const [feedStatus, setFeedStatus] = useState<FeedStatusData | null>(null);
  const [feedSyncing, setFeedSyncing] = useState(false);
  const [feedSyncResult, setFeedSyncResult] = useState<FeedSyncData | null>(null);
  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStatsData | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [embedResult, setEmbedResult] = useState<EmbedResult | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusData | null>(null);
  const [emailPrefs, setEmailPrefs] = useState<EmailPreferencesData | null>(null);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

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
      fetchFeedStatus()
        .then((env) => {
          if (env.success && env.data) setFeedStatus(env.data);
        })
        .catch(() => { /* feeds endpoint may not exist yet */ }),
      fetchEmbeddingStats()
        .then((env) => {
          if (env.success && env.data) setEmbeddingStats(env.data);
        })
        .catch(() => { /* embeddings endpoint may not exist yet */ }),
      fetchEmailStatus()
        .then((env) => {
          if (env.success && env.data) setEmailStatus(env.data);
        })
        .catch(() => { /* email endpoint may not exist yet */ }),
      fetchEmailPreferences()
        .then((env) => {
          if (env.success && env.data) setEmailPrefs(env.data);
        })
        .catch(() => { /* email prefs may not exist yet */ }),
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

  async function runFeedSync(feed?: "sam" | "fpds" | "all") {
    setFeedSyncing(true);
    setFeedSyncResult(null);
    try {
      const env = await triggerFeedSync(feed, 30);
      if (env.success && env.data) {
        setFeedSyncResult(env.data);
        // Refresh feed status
        const status = await fetchFeedStatus();
        if (status.success && status.data) setFeedStatus(status.data);
      }
    } catch (err) {
      setFeedSyncResult({ results: [{ feed: feed ?? "all", status: "error", fetched: 0, upserted: 0, errors: 1, durationMs: 0, error: (err as Error).message }], timestamp: new Date().toISOString() });
    } finally {
      setFeedSyncing(false);
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

      {/* Data Feeds */}
      <Section title="Data Feeds (SAM.gov / FPDS)">
        {feedStatus?.feeds ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {feedStatus.feeds.map((f) => (
              <div key={f.id} style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 16,
                background: "var(--color-surface)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{f.name}</span>
                    <span style={{
                      marginLeft: 8,
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: f.configured ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                      color: f.configured ? "#22c55e" : "#ef4444",
                      fontWeight: 600,
                    }}>
                      {f.configured ? "Configured" : "Not Configured"}
                    </span>
                  </div>
                  <button
                    onClick={() => runFeedSync(f.id === "sam-opportunities" ? "sam" : "fpds")}
                    disabled={feedSyncing || !f.configured}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--color-primary)",
                      background: "rgba(59,130,246,0.1)",
                      color: "var(--color-primary)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: feedSyncing || !f.configured ? "not-allowed" : "pointer",
                      opacity: feedSyncing || !f.configured ? 0.5 : 1,
                    }}
                  >
                    {feedSyncing ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  {f.description}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                  <InfoCard label="Source" value={f.source} />
                  <InfoCard label="Records" value={String(f.record_count ?? 0)} />
                  {f.last_sync && <InfoCard label="Last Sync" value={new Date(f.last_sync).toLocaleString()} />}
                  {f.last_status && <InfoCard label="Status" value={f.last_status} color={f.last_status === "completed" ? "#22c55e" : "#f59e0b"} />}
                  {!f.configured && f.api_key_env && <InfoCard label="Required" value={f.api_key_env} color="#ef4444" />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <InfoCard label="Status" value="Loading..." />
        )}

        {feedSyncResult && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Sync Results</div>
            {feedSyncResult.results.map((r) => (
              <div key={r.feed} style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{r.feed}:</span>{" "}
                <span style={{ color: r.status === "success" ? "#22c55e" : "#ef4444" }}>{r.status}</span>
                {r.status === "success" && ` — ${r.fetched} fetched, ${r.upserted} upserted (${r.durationMs}ms)`}
                {r.error && <span style={{ color: "#ef4444" }}> — {r.error}</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 13, color: "var(--color-text-muted)" }}>
          SAM.gov requires an API key (<a href="https://sam.gov" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)" }}>get one here</a>).
          FPDS/USAspending data is free and requires no API key.
          Feeds sync automatically every 6 hours when configured.
        </div>
      </Section>

      {/* Vector Search / Embeddings */}
      <Section title="Vector Search (pgvector)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          {embeddingStats ? (
            <>
              <InfoCard label="Total Documents" value={String(embeddingStats.totalDocuments)} />
              <InfoCard label="Embedded" value={String(embeddingStats.embeddedDocuments)} color={embeddingStats.embeddedDocuments > 0 ? "#22c55e" : "#6b7280"} />
              <InfoCard label="Pending" value={String(embeddingStats.pendingDocuments)} color={embeddingStats.pendingDocuments > 0 ? "#f59e0b" : "#6b7280"} />
              <InfoCard label="Failed" value={String(embeddingStats.failedDocuments)} color={embeddingStats.failedDocuments > 0 ? "#ef4444" : "#6b7280"} />
              <InfoCard label="Total Chunks" value={String(embeddingStats.totalChunks)} />
              <InfoCard label="OpenAI Key" value={embeddingStats.embeddingAvailable ? "Configured" : "Not Set"} color={embeddingStats.embeddingAvailable ? "#22c55e" : "#ef4444"} />
            </>
          ) : (
            <InfoCard label="Status" value="Loading..." color="#6b7280" />
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <button
            onClick={async () => {
              setEmbedding(true);
              setEmbedResult(null);
              try {
                const env = await triggerEmbedAll();
                if (env.success && env.data) {
                  setEmbedResult(env.data);
                  const stats = await fetchEmbeddingStats();
                  if (stats.success && stats.data) setEmbeddingStats(stats.data);
                }
              } catch (err) {
                setEmbedResult({ total: 0, embedded: 0, failed: 1, skipped: 0 });
              } finally {
                setEmbedding(false);
              }
            }}
            disabled={embedding || !embeddingStats?.embeddingAvailable}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: embedding || !embeddingStats?.embeddingAvailable ? "#374151" : "#7c3aed",
              color: "#fff",
              cursor: embedding || !embeddingStats?.embeddingAvailable ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: embedding || !embeddingStats?.embeddingAvailable ? 0.5 : 1,
            }}
          >
            {embedding ? "Embedding..." : "Embed All Documents"}
          </button>
          {embedResult && (
            <span style={{ fontSize: 13, color: embedResult.failed > 0 ? "#f59e0b" : "#22c55e" }}>
              Embedded: {embedResult.embedded} | Skipped: {embedResult.skipped} | Failed: {embedResult.failed}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          pgvector enables real semantic search across your Knowledge Base documents.
          When OpenAI API key is configured, document text is split into chunks and
          embedded using text-embedding-3-small (1536 dimensions). Search queries are
          matched by cosine similarity via HNSW index.
          {!embeddingStats?.embeddingAvailable && " Set OPENAI_API_KEY to enable."}
        </div>
      </Section>

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
            <div style={{ fontSize: 13,  lineHeight: 1.8 }}>
              {backupStatus.backups.daily.slice(0, 7).map((b) => (
                <div key={b} style={{ color: "var(--color-text-muted)" }}>{b}</div>
              ))}
            </div>
          </div>
        )}

        {backupStatus && backupStatus.backups.weekly.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--color-text-muted)" }}>Weekly Backups</div>
            <div style={{ fontSize: 13,  lineHeight: 1.8 }}>
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

      {/* Email Notifications */}
      <Section title="Email Notifications">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          <InfoCard label="SMTP Status" value={emailStatus?.configured ? "Configured" : "Not Configured"} />
          {emailStatus?.configured && <InfoCard label="SMTP Host" value={emailStatus.smtp_host ?? "—"} />}
          <InfoCard label="Emails Sent" value={String(emailStatus?.total_sent ?? 0)} />
          <InfoCard label="Failed" value={String(emailStatus?.total_failed ?? 0)} />
        </div>

        {/* SMTP Test */}
        {emailStatus?.configured && (
          <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                setEmailTesting(true);
                setEmailTestResult(null);
                try {
                  const env = await apiTestSmtp();
                  if (env.success && env.data?.connected) {
                    setEmailTestResult("SMTP connection successful");
                  } else {
                    setEmailTestResult(`SMTP connection failed: ${env.data?.error ?? env.error?.message}`);
                  }
                } catch (err) {
                  setEmailTestResult(`Error: ${(err as Error).message}`);
                } finally {
                  setEmailTesting(false);
                }
              }}
              disabled={emailTesting}
              style={{
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                cursor: emailTesting ? "wait" : "pointer",
                opacity: emailTesting ? 0.7 : 1,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {emailTesting ? "Testing..." : "Test SMTP Connection"}
            </button>
            <button
              onClick={async () => {
                setEmailTesting(true);
                setEmailTestResult(null);
                try {
                  const user = getUser();
                  const env = await sendTestEmail(user?.email ?? "");
                  if (env.success && env.data?.sent) {
                    setEmailTestResult("Test email sent successfully!");
                  } else {
                    setEmailTestResult(`Send failed: ${env.data?.error ?? env.error?.message}`);
                  }
                } catch (err) {
                  setEmailTestResult(`Error: ${(err as Error).message}`);
                } finally {
                  setEmailTesting(false);
                }
              }}
              disabled={emailTesting}
              style={{
                background: "transparent",
                color: "#3b82f6",
                border: "1px solid #3b82f6",
                padding: "8px 16px",
                borderRadius: 6,
                cursor: emailTesting ? "wait" : "pointer",
                opacity: emailTesting ? 0.7 : 1,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Send Test Email
            </button>
            {emailTestResult && (
              <span style={{ fontSize: 13, color: emailTestResult.includes("successful") || emailTestResult.includes("sent") ? "#22c55e" : "#ef4444" }}>
                {emailTestResult}
              </span>
            )}
          </div>
        )}

        {/* User Notification Preferences */}
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16, marginTop: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--color-text)" }}>Your Notification Preferences</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Email notifications toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={emailPrefs?.email_notifications_enabled ?? false}
                onChange={async (e) => {
                  setSavingPrefs(true);
                  const env = await updateEmailPreferences({ email_notifications_enabled: e.target.checked });
                  if (env.success && env.data) setEmailPrefs(env.data);
                  setSavingPrefs(false);
                }}
                disabled={savingPrefs}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14 }}>Enable email notifications</span>
            </label>

            {/* Digest toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={emailPrefs?.email_digest_enabled ?? false}
                onChange={async (e) => {
                  setSavingPrefs(true);
                  const env = await updateEmailPreferences({ email_digest_enabled: e.target.checked });
                  if (env.success && env.data) setEmailPrefs(env.data);
                  setSavingPrefs(false);
                }}
                disabled={savingPrefs}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14 }}>Email digest summary</span>
            </label>

            {/* Digest frequency */}
            {emailPrefs?.email_digest_enabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 28 }}>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Frequency:</span>
                <select
                  value={emailPrefs?.email_digest_frequency ?? "daily"}
                  onChange={async (e) => {
                    setSavingPrefs(true);
                    const env = await updateEmailPreferences({ email_digest_frequency: e.target.value });
                    if (env.success && env.data) setEmailPrefs(env.data);
                    setSavingPrefs(false);
                  }}
                  disabled={savingPrefs}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: 13,
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            )}

            {/* Category toggles */}
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 8 }}>
                Notification Categories
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["critical", "approval", "deadline", "anomaly", "system"].map((cat) => {
                  const cats = emailPrefs?.notification_categories ?? [];
                  const active = cats.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={async () => {
                        setSavingPrefs(true);
                        const updated = active
                          ? cats.filter((c) => c !== cat)
                          : [...cats, cat];
                        const env = await updateEmailPreferences({ notification_categories: updated });
                        if (env.success && env.data) setEmailPrefs(env.data);
                        setSavingPrefs(false);
                      }}
                      disabled={savingPrefs}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 16,
                        border: active ? "1px solid #3b82f6" : "1px solid var(--color-border)",
                        background: active ? "rgba(59,130,246,0.1)" : "transparent",
                        color: active ? "#3b82f6" : "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {!emailStatus?.configured && (
          <div style={{ marginTop: 16, padding: 12, background: "rgba(245,158,11,0.08)", borderRadius: 6, fontSize: 13, color: "#f59e0b" }}>
            SMTP is not configured. Set <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> environment variables to enable email delivery.
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
                        
                        background: ep.method === "GET" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                        color: ep.method === "GET" ? "#22c55e" : "#f59e0b",
                      }}
                    >
                      {ep.method}
                    </span>
                  </td>
                  <td style={{ padding: "8px 14px",  fontSize: 13 }}>{ep.path}</td>
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
        <div style={{ fontSize: 11, color: "var(--color-text-muted)",  marginTop: 4 }}>
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
