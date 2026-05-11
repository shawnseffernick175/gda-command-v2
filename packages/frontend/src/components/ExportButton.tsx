import { useState } from "react";
import { authenticatedFetch } from "../api/auth";

interface ExportButtonProps {
  endpoint: string;
  label?: string;
}

export default function ExportButton({ endpoint, label = "Export CSV" }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/export/${endpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("content-disposition");
      const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? `gda-${endpoint}.csv`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      style={{
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid var(--color-border)",
        background: "transparent",
        color: "var(--color-text-muted)",
        cursor: loading ? "wait" : "pointer",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: loading ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 14 }}>⬇</span>
      {loading ? "Exporting…" : label}
    </button>
  );
}
