import { useEffect, useState } from "react";
import { fetchAuditLog, fetchAuditStats, type AuditEntry, type AuditStats } from "../api/client";

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ action: "", resourceType: "" });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAuditLog(page, 50, filter.action || undefined, filter.resourceType || undefined),
      page === 1 ? fetchAuditStats() : Promise.resolve(null),
    ])
      .then(([logRes, statsRes]) => {
        if (logRes.success && logRes.data) {
          setEntries(logRes.data.entries);
          setTotal(logRes.data.total);
        }
        if (statsRes?.success && statsRes.data) {
          setStats(statsRes.data);
        }
      })
      .finally(() => setLoading(false));
  }, [page, filter]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Audit Log</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>
        Track all write operations across the system.
      </p>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Events" value={String(stats.totalEntries)} />
          <StatCard label="Top Action" value={stats.topActions[0]?.action?.split(" ")[0] ?? "—"} />
          <StatCard label="Active Users" value={String(stats.topUsers.length)} />
          <StatCard label="Today" value={String(stats.recentActivity[0]?.count ?? 0)} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select
          value={filter.resourceType}
          onChange={(e) => { setFilter((f) => ({ ...f, resourceType: e.target.value })); setPage(1); }}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Resources</option>
          {["opportunities", "contacts", "approvals", "admin", "backup", "knowledge", "discussions", "auth", "email", "dashboard-layout", "feeds"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by action..."
          value={filter.action}
          onChange={(e) => { setFilter((f) => ({ ...f, action: e.target.value })); setPage(1); }}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            width: 250,
          }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 20, color: "var(--color-text-muted)" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: 20, color: "var(--color-text-muted)" }}>No audit entries found.</div>
      ) : (
        <>
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Resource</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={tdStyle}>
                      <span title={entry.created_at}>
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td style={tdStyle}>{entry.user_email ?? "system"}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: methodColor(entry.details?.method as string),
                        color: "#fff",
                      }}>
                        {String(entry.details?.method ?? "?")}
                      </span>{" "}
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {String(entry.details?.path ?? entry.action)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {entry.resource_type}
                      {entry.resource_id ? ` / ${entry.resource_id.slice(0, 8)}…` : ""}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: (entry.details?.statusCode as number) < 300 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        color: (entry.details?.statusCode as number) < 300 ? "#22c55e" : "#ef4444",
                      }}>
                        {String(entry.details?.statusCode ?? "OK")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={paginationBtn}
              >
                ← Prev
              </button>
              <span style={{ padding: "8px 12px", fontSize: 13, color: "var(--color-text-muted)" }}>
                Page {page} of {totalPages} ({total} entries)
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={paginationBtn}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: "16px 20px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function methodColor(method?: string): string {
  switch (method) {
    case "POST": return "#3b82f6";
    case "PUT": return "#f59e0b";
    case "PATCH": return "#8b5cf6";
    case "DELETE": return "#ef4444";
    default: return "#6b7280";
  }
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
};

const paginationBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  cursor: "pointer",
  fontSize: 13,
};
