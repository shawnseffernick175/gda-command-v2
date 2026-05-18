import { useEffect, useState, useCallback } from "react";
import {
  fetchSources,
  updateSource,
  triggerSourceSync,
  type SourceEntry,
} from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  success: "#22c55e",
  error: "#ef4444",
  running: "#3b82f6",
  never: "#64748b",
};

const CATEGORY_LABELS: Record<string, string> = {
  government: "Government",
  commercial: "Commercial",
  internal: "Internal",
};

const TYPE_ICONS: Record<string, string> = {
  api: "API",
  webhook: "WH",
  file: "FILE",
  rss: "RSS",
  manual: "MAN",
};

export default function SourceManager() {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [totalSynced, setTotalSynced] = useState(0);
  const [enabledCount, setEnabledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchSources();
      if (env.success && env.data) {
        setSources(env.data.sources);
        setTotalSynced(env.data.total_records_synced);
        setEnabledCount(env.data.enabled);
      } else {
        setError(env.error?.message ?? "Failed to load sources");
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (source: SourceEntry) => {
    try {
      await updateSource(source.id, { enabled: !source.enabled });
      await load();
    } catch {
      // reload to get latest state
      await load();
    }
  };

  const handleSync = async (sourceId: string) => {
    setSyncing(sourceId);
    try {
      await triggerSourceSync(sourceId);
      // Wait a moment then reload to show updated status
      setTimeout(() => {
        load();
        setSyncing(null);
      }, 2000);
    } catch {
      setSyncing(null);
      await load();
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
        Loading source registry...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ color: "#ef4444", marginBottom: 16 }}>Error: {error}</div>
        <button onClick={load} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
          Data Sources
        </h1>
        <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 14 }}>
          {enabledCount} active sources · {totalSynced.toLocaleString()} total records synced
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <KPICard label="Total Sources" value={sources.length} color="#3b82f6" />
        <KPICard label="Active" value={enabledCount} color="#22c55e" />
        <KPICard label="Records Synced" value={totalSynced.toLocaleString()} color="#8b5cf6" />
        <KPICard label="Errors" value={sources.filter((s) => s.last_sync_status === "error").length} color="#ef4444" />
      </div>

      {/* Source Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
        {sources.map((source) => (
          <div
            key={source.id}
            style={{
              background: "#0f172a",
              border: `1px solid ${source.enabled ? "#1e293b" : "#1e293b80"}`,
              borderRadius: 8,
              padding: 16,
              opacity: source.enabled ? 1 : 0.6,
            }}
          >
            {/* Card Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: "#1e293b",
                  color: "#94a3b8",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "monospace",
                }}>
                  {TYPE_ICONS[source.source_type] ?? source.source_type}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>{source.name}</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={() => handleToggle(source)}
                  style={{ accentColor: "#3b82f6" }}
                />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{source.enabled ? "On" : "Off"}</span>
              </label>
            </div>

            {/* Card Body */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginBottom: 12 }}>
              <div>
                <span style={{ color: "#64748b" }}>Category: </span>
                <span style={{ color: "#94a3b8" }}>{CATEGORY_LABELS[source.category] ?? source.category}</span>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Frequency: </span>
                <span style={{ color: "#94a3b8" }}>{source.sync_frequency}</span>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Auth: </span>
                <span style={{ color: "#94a3b8" }}>{source.auth_type.replace("_", " ")}</span>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Total: </span>
                <span style={{ color: "#94a3b8" }}>{source.total_synced.toLocaleString()} records</span>
              </div>
            </div>

            {/* Sync Status */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#1e293b",
              borderRadius: 6,
              padding: "8px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: STATUS_COLORS[source.last_sync_status] ?? "#64748b",
                  display: "inline-block",
                }} />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  {source.last_sync_status === "never"
                    ? "Never synced"
                    : `Last: ${source.last_sync_at ? new Date(source.last_sync_at).toLocaleDateString() : "—"} (${source.last_sync_count} records)`}
                </span>
              </div>
              <button
                onClick={() => handleSync(source.id)}
                disabled={!source.enabled || syncing === source.id || source.source_type === "manual"}
                style={{
                  padding: "4px 10px",
                  background: syncing === source.id ? "#475569" : "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: (!source.enabled || syncing === source.id || source.source_type === "manual") ? "default" : "pointer",
                  fontSize: 11,
                  opacity: (!source.enabled || source.source_type === "manual") ? 0.5 : 1,
                }}
              >
                {syncing === source.id ? "Syncing..." : "Sync Now"}
              </button>
            </div>

            {/* Error display */}
            {source.last_error && source.last_sync_status === "error" && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: "#7f1d1d20", border: "1px solid #7f1d1d", borderRadius: 4, fontSize: 11, color: "#fca5a5" }}>
                {source.last_error.slice(0, 120)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
