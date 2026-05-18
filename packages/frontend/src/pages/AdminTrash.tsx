import { useState, useEffect } from "react";
import { authenticatedFetch } from "../api/auth";

const TABLES = [
  "opportunities",
  "capture_plans",
  "proposals",
  "contacts",
  "intel_items",
  "compliance_requirements",
  "doctrine_drafts",
  "color_reviews",
  "risk_register",
  "competitor_profiles",
  "knowledge_documents",
  "cpars_records",
];

interface TrashRecord {
  id: string;
  title?: string;
  name?: string;
  deleted_at: string;
  [key: string]: unknown;
}

export default function AdminTrash() {
  const [selectedTable, setSelectedTable] = useState("opportunities");
  const [records, setRecords] = useState<TrashRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchTrash() {
      setLoading(true);
      try {
        const res = await authenticatedFetch(`/api/versions/trash/${selectedTable}`);
        if (res.ok) {
          const body = await res.json();
          setRecords(body?.data?.records ?? []);
        }
      } catch {
        setRecords([]);
      }
      setLoading(false);
    }
    fetchTrash();
  }, [selectedTable]);

  const handleUndelete = async (recordId: string) => {
    if (!confirm("Restore this record from trash?")) return;
    try {
      // Get latest version and restore
      const verRes = await authenticatedFetch(`/api/versions/${selectedTable}/${recordId}`);
      if (verRes.ok) {
        const body = await verRes.json();
        const versions = body?.data?.versions ?? [];
        // Find last non-delete version
        const restoreVer = versions.find((v: { change_type: string }) => v.change_type !== "delete");
        if (restoreVer) {
          await authenticatedFetch(`/api/versions/${selectedTable}/${recordId}/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version_number: restoreVer.version_number }),
          });
          setRecords((prev) => prev.filter((r) => r.id !== recordId));
        }
      }
    } catch {
      // silently fail
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "var(--color-text, #e2e8f0)" }}>
        Trash
      </h2>
      <p style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: 13, marginBottom: 16 }}>
        Soft-deleted records. Admin can restore any record from here.
      </p>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABLES.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedTable(t)}
            style={{
              background: selectedTable === t ? "#3b82f6" : "var(--color-surface, #1e293b)",
              color: selectedTable === t ? "#fff" : "var(--color-text-muted, #94a3b8)",
              border: "1px solid var(--color-border, #334155)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>Loading...</div>
      ) : records.length === 0 ? (
        <div style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>
          No deleted records in {selectedTable}.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border, #334155)" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-muted, #94a3b8)" }}>ID</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-muted, #94a3b8)" }}>Title / Name</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-muted, #94a3b8)" }}>Deleted At</th>
              <th style={{ textAlign: "right", padding: "8px 12px", color: "var(--color-text-muted, #94a3b8)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border, #334155)" }}>
                <td style={{ padding: "8px 12px", color: "var(--color-text, #e2e8f0)", fontFamily: "monospace" }}>
                  {String(r.id).slice(0, 16)}
                </td>
                <td style={{ padding: "8px 12px", color: "var(--color-text, #e2e8f0)" }}>
                  {r.title ?? r.name ?? "—"}
                </td>
                <td style={{ padding: "8px 12px", color: "var(--color-text-muted, #94a3b8)" }}>
                  {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  <button
                    onClick={() => handleUndelete(r.id)}
                    style={{
                      background: "#22c55e",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "3px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
