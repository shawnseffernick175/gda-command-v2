import { useState, useEffect } from "react";
import { authenticatedFetch } from "../api/auth";

interface Version {
  version_id: string;
  table_name: string;
  record_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  changed_by: string;
  changed_at: string;
  change_type: "create" | "update" | "delete" | "restore";
  change_summary: Record<string, { from: unknown; to: unknown }> | null;
}

interface VersionHistoryProps {
  table: string;
  recordId: string;
  onRestore?: () => void;
}

export default function VersionHistory({ table, recordId, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    async function fetchVersions() {
      setLoading(true);
      try {
        const res = await authenticatedFetch(`/api/versions/${table}/${recordId}`);
        if (res.ok) {
          const body = await res.json();
          setVersions(body?.data?.versions ?? []);
        }
      } catch {
        // silently fail — version history is non-critical UI
      }
      setLoading(false);
    }
    if (table && recordId) fetchVersions();
  }, [table, recordId]);

  const handleRestore = async (versionNumber: number) => {
    if (!confirm(`Restore to version ${versionNumber}? This creates a new version.`)) return;
    setRestoring(true);
    try {
      const res = await authenticatedFetch(`/api/versions/${table}/${recordId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_number: versionNumber }),
      });
      if (res.ok) {
        onRestore?.();
        // Refresh version list
        const listRes = await authenticatedFetch(`/api/versions/${table}/${recordId}`);
        if (listRes.ok) {
          const body = await listRes.json();
          setVersions(body?.data?.versions ?? []);
        }
      }
    } catch {
      // silently fail
    }
    setRestoring(false);
  };

  const typeColors: Record<string, string> = {
    create: "#22c55e",
    update: "#3b82f6",
    delete: "#ef4444",
    restore: "#a855f7",
  };

  if (loading) {
    return <div style={{ padding: 12, color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>Loading version history...</div>;
  }

  if (versions.length === 0) {
    return <div style={{ padding: 12, color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>No version history yet.</div>;
  }

  return (
    <div style={{ maxHeight: 400, overflowY: "auto" }}>
      {versions.map((v) => (
        <div
          key={v.version_id}
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--color-border, #334155)",
            cursor: "pointer",
          }}
          onClick={() => setExpanded(expanded === v.version_id ? null : v.version_id)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: typeColors[v.change_type] ?? "#94a3b8",
              }}
            />
            <strong>v{v.version_number}</strong>
            <span style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: 12 }}>
              {v.change_type}
            </span>
            <span style={{ marginLeft: "auto", color: "var(--color-text-muted, #94a3b8)", fontSize: 12 }}>
              {new Date(v.changed_at).toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted, #94a3b8)" }}>
              by {v.changed_by === "system_trigger" ? "auto" : v.changed_by.slice(0, 8)}
            </span>
          </div>

          {expanded === v.version_id && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {v.change_summary && Object.keys(v.change_summary).length > 0 ? (
                <div style={{ marginBottom: 8 }}>
                  <strong>Changes:</strong>
                  <ul style={{ margin: "4px 0", paddingLeft: 16 }}>
                    {Object.entries(v.change_summary).map(([field, diff]) => (
                      <li key={field} style={{ color: "var(--color-text-muted, #94a3b8)" }}>
                        <code>{field}</code>: {String(diff.from ?? "null")} → {String(diff.to ?? "null")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ color: "var(--color-text-muted, #94a3b8)", marginBottom: 8 }}>
                  {v.change_type === "create" ? "Initial creation" : "No field-level diff available"}
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestore(v.version_number);
                }}
                disabled={restoring}
                style={{
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "4px 12px",
                  cursor: restoring ? "wait" : "pointer",
                  fontSize: 12,
                }}
              >
                {restoring ? "Restoring..." : `Restore to v${v.version_number}`}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
