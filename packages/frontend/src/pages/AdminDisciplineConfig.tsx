import { useEffect, useState, useCallback } from "react";
import { authenticatedFetch } from "../api/auth";
import type { CaptureDisciplineConfig } from "@gda/shared";

const FIELD_DEFS: Array<{
  key: keyof Omit<CaptureDisciplineConfig, "id" | "created_at" | "updated_at">;
  label: string;
  tooltip: string;
  type: "currency" | "ratio" | "percent" | "integer";
}> = [
  { key: "revenue_target_usd", label: "Revenue Target (USD)", tooltip: "Annual revenue goal. Pipeline coverage is measured against this.", type: "currency" },
  { key: "pipeline_coverage_min", label: "Min Pipeline Coverage", tooltip: "Minimum acceptable coverage ratio (e.g. 3.0 = 3× revenue target).", type: "ratio" },
  { key: "pipeline_coverage_target", label: "Target Pipeline Coverage", tooltip: "Ideal coverage ratio (e.g. 5.0 = 5× revenue target). Industry benchmark: 3×–5×.", type: "ratio" },
  { key: "pwin_floor_pursue", label: "Pwin Floor — Pursue", tooltip: "Minimum Pwin % required to advance from Qualify to Pursue.", type: "percent" },
  { key: "pwin_floor_capture", label: "Pwin Floor — Capture", tooltip: "Minimum Pwin % required to advance to Capture.", type: "percent" },
  { key: "pwin_floor_bid_decision", label: "Pwin Floor — Bid Decision", tooltip: "Minimum Pwin % required for Proposal/Submit.", type: "percent" },
  { key: "captures_per_manager_max", label: "Max Captures per Manager", tooltip: "Shipley-aligned norm: 3–5 simultaneous high-quality captures per manager.", type: "integer" },
  { key: "proposals_per_manager_max", label: "Max Proposals per Manager", tooltip: "Healthy load: 1–2 concurrent major proposals.", type: "integer" },
  { key: "task_orders_per_manager_max", label: "Max Task Orders per Manager", tooltip: "Healthy load: 3–4 concurrent task-order responses.", type: "integer" },
];

export default function AdminDisciplineConfig() {
  const [config, setConfig] = useState<CaptureDisciplineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    authenticatedFetch("/api/discipline/config")
      .then((r) => r.json())
      .then((env) => {
        if (env.success && env.data) setConfig(env.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await authenticatedFetch("/api/discipline/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const env = await res.json();
      if (env.success && env.data) {
        setConfig(env.data);
        setSaveMsg("Saved");
      } else {
        setSaveMsg("Failed to save");
      }
    } catch {
      setSaveMsg("Network error");
    } finally {
      setSaving(false);
    }
  }, [config]);

  if (loading || !config) {
    return (
      <div style={{ padding: 24, color: "var(--color-text-muted, #94a3b8)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text, #e2e8f0)", marginBottom: 16 }}>
        Capture Discipline Config
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {FIELD_DEFS.map(({ key, label, tooltip, type }) => (
          <div key={key}>
            <label
              title={tooltip}
              style={{ display: "block", fontSize: 12, color: "var(--color-text-muted, #94a3b8)", marginBottom: 2, cursor: "help" }}
            >
              {label}
            </label>
            <input
              type="number"
              step={type === "currency" ? "1000" : type === "ratio" ? "0.1" : type === "percent" ? "1" : "1"}
              value={config[key] ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? 0 : Number(e.target.value);
                setConfig({ ...config, [key]: val });
              }}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "var(--color-surface, #1e293b)",
                color: "var(--color-text, #e2e8f0)",
                border: "1px solid var(--color-border, #334155)",
                borderRadius: 4,
                fontSize: 13,
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "8px 24px",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 12, color: saveMsg === "Saved" ? "#22c55e" : "#ef4444" }}>
            {saveMsg}
          </span>
        )}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: "var(--color-text-muted, #94a3b8)" }}>
        Hover over labels for Shipley-aligned guidance tooltips.
      </div>
    </div>
  );
}
