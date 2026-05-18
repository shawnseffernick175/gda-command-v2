import { useState, useEffect, useCallback } from "react";
import { authenticatedFetch } from "../api/auth";
import type { CompanyEntity, EntityStatus } from "@gda/shared";

const ENTITY_STATUS_OPTIONS: EntityStatus[] = ["legacy", "merging", "newco", "subsidiary", "partner"];

const STATUS_COLORS: Record<EntityStatus, string> = {
  legacy: "#6b7280",
  merging: "#f59e0b",
  newco: "#22c55e",
  subsidiary: "#3b82f6",
  partner: "#8b5cf6",
};

export default function AdminCompanies() {
  const [entities, setEntities] = useState<CompanyEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyEntity | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CompanyEntity>>({});

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/admin/companies");
      if (res.ok) {
        const body = await res.json();
        setEntities(body?.data?.entities ?? []);
      }
    } catch {
      setError("Failed to load company entities");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);

  const handleSelect = (entity: CompanyEntity) => {
    setSelected(entity);
    setFormData({ ...entity });
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`/api/admin/companies/${selected.entity_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const body = await res.json();
        const updated = body?.data;
        setSelected(updated);
        setFormData({ ...updated });
        setEditing(false);
        fetchEntities();
      } else {
        const body = await res.json();
        setError(body?.error?.message ?? "Failed to save");
      }
    } catch {
      setError("Failed to save entity");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected || !confirm(`Delete ${selected.legal_name}? This is a soft-delete and can be restored from Trash.`)) return;
    try {
      const res = await authenticatedFetch(`/api/admin/companies/${selected.entity_id}`, { method: "DELETE" });
      if (res.ok) {
        setSelected(null);
        fetchEntities();
      }
    } catch {
      setError("Failed to delete entity");
    }
  };

  const updateField = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateArrayField = (field: string, value: string) => {
    const arr = value.split(",").map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, [field]: arr }));
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
        Loading company entities...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 24, padding: 0, height: "100%" }}>
      {/* Left panel — entity list */}
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #1e293b", padding: "16px 0", overflowY: "auto" }}>
        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #1e293b" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>
            Company Entities
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
            {entities.length} entities — merger context
          </p>
        </div>
        {entities.map(e => (
          <div
            key={e.entity_id}
            onClick={() => handleSelect(e)}
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              borderBottom: "1px solid #1e293b",
              background: selected?.entity_id === e.entity_id ? "#1e3a5f" : "transparent",
            }}
          >
            <div style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 14 }}>{e.legal_name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <span style={{
                fontSize: 11, padding: "2px 6px", borderRadius: 4,
                background: STATUS_COLORS[e.status] + "22",
                color: STATUS_COLORS[e.status],
                fontWeight: 600, textTransform: "uppercase",
              }}>
                {e.status}
              </span>
              <span style={{ fontSize: 12, color: "#64748b" }}>{e.entity_id}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right panel — detail/edit */}
      <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
        {!selected ? (
          <div style={{ textAlign: "center", color: "#64748b", paddingTop: 80 }}>
            Select an entity from the list to view details
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#f1f5f9" }}>
                {selected.legal_name}
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                {editing ? (
                  <>
                    <button onClick={handleSave} disabled={saving}
                      style={{ padding: "6px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => { setEditing(false); setFormData({ ...selected }); }}
                      style={{ padding: "6px 16px", background: "#374151", color: "#d1d5db", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditing(true)}
                      style={{ padding: "6px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      Edit
                    </button>
                    <button onClick={handleDelete}
                      style={{ padding: "6px 16px", background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div style={{ padding: "8px 12px", background: "#7f1d1d", color: "#fca5a5", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <FieldGroup label="Entity ID">
                <ReadOnlyField value={selected.entity_id} />
              </FieldGroup>
              <FieldGroup label="Status">
                {editing ? (
                  <select value={formData.status ?? ""} onChange={e => updateField("status", e.target.value)}
                    style={selectStyle}>
                    {ENTITY_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span style={{ color: STATUS_COLORS[selected.status], fontWeight: 600, textTransform: "uppercase" }}>
                    {selected.status}
                  </span>
                )}
              </FieldGroup>
              <FieldGroup label="Legal Name">
                <EditableField editing={editing} value={formData.legal_name ?? ""} onChange={v => updateField("legal_name", v)} />
              </FieldGroup>
              <FieldGroup label="DBA Names">
                <EditableField editing={editing} value={(formData.dba_names ?? []).join(", ")} onChange={v => updateArrayField("dba_names", v)} />
              </FieldGroup>
              <FieldGroup label="CAGE Code">
                <EditableField editing={editing} value={formData.cage_code ?? ""} onChange={v => updateField("cage_code", v || null)} />
              </FieldGroup>
              <FieldGroup label="UEI">
                <EditableField editing={editing} value={formData.uei ?? ""} onChange={v => updateField("uei", v || null)} />
              </FieldGroup>
              <FieldGroup label="DUNS">
                <EditableField editing={editing} value={formData.duns ?? ""} onChange={v => updateField("duns", v || null)} />
              </FieldGroup>
              <FieldGroup label="Primary NAICS">
                <EditableField editing={editing} value={formData.primary_naics ?? ""} onChange={v => updateField("primary_naics", v || null)} />
              </FieldGroup>
              <FieldGroup label="NAICS Codes">
                <EditableField editing={editing} value={(formData.naics_codes ?? []).join(", ")} onChange={v => updateArrayField("naics_codes", v)} />
              </FieldGroup>
              <FieldGroup label="PSC Codes">
                <EditableField editing={editing} value={(formData.psc_codes ?? []).join(", ")} onChange={v => updateArrayField("psc_codes", v)} />
              </FieldGroup>
              <FieldGroup label="Set-Aside Status">
                <EditableField editing={editing} value={(formData.set_aside_status ?? []).join(", ")} onChange={v => updateArrayField("set_aside_status", v)} />
              </FieldGroup>
              <FieldGroup label="Capabilities">
                <EditableField editing={editing} value={(formData.capabilities ?? []).join(", ")} onChange={v => updateArrayField("capabilities", v)} />
              </FieldGroup>
              <FieldGroup label="Headquarters">
                <EditableField editing={editing} value={formData.headquarters ?? ""} onChange={v => updateField("headquarters", v || null)} />
              </FieldGroup>
              <FieldGroup label="Employee Count">
                <EditableField editing={editing} value={String(formData.employee_count ?? "")} onChange={v => updateField("employee_count", v ? parseInt(v, 10) || null : null)} />
              </FieldGroup>
              <FieldGroup label="Revenue Band">
                <EditableField editing={editing} value={formData.revenue_band ?? ""} onChange={v => updateField("revenue_band", v || null)} />
              </FieldGroup>
              <FieldGroup label="Primary Customers">
                <EditableField editing={editing} value={(formData.primary_customers ?? []).join(", ")} onChange={v => updateArrayField("primary_customers", v)} />
              </FieldGroup>
            </div>

            <FieldGroup label="Differentiators" style={{ marginTop: 16 }}>
              {editing ? (
                <textarea value={formData.differentiators ?? ""} onChange={e => updateField("differentiators", e.target.value || null)}
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
              ) : (
                <div style={{ color: "#cbd5e1", fontSize: 13 }}>{selected.differentiators || "—"}</div>
              )}
            </FieldGroup>

            <FieldGroup label="Description" style={{ marginTop: 16 }}>
              {editing ? (
                <textarea value={formData.description ?? ""} onChange={e => updateField("description", e.target.value || null)}
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
              ) : (
                <div style={{ color: "#cbd5e1", fontSize: 13 }}>{selected.description || "—"}</div>
              )}
            </FieldGroup>

            <FieldGroup label="Certifications (JSON)" style={{ marginTop: 16 }}>
              {editing ? (
                <textarea value={JSON.stringify(formData.certifications ?? [], null, 2)}
                  onChange={e => { try { updateField("certifications", JSON.parse(e.target.value)); } catch { /* ignore parse errors while typing */ } }}
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
              ) : (
                <pre style={{ color: "#cbd5e1", fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(selected.certifications, null, 2)}
                </pre>
              )}
            </FieldGroup>

            <FieldGroup label="Contract Vehicles (JSON)" style={{ marginTop: 16 }}>
              {editing ? (
                <textarea value={JSON.stringify(formData.contract_vehicles ?? [], null, 2)}
                  onChange={e => { try { updateField("contract_vehicles", JSON.parse(e.target.value)); } catch { /* ignore parse errors while typing */ } }}
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
              ) : (
                <pre style={{ color: "#cbd5e1", fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(selected.contract_vehicles, null, 2)}
                </pre>
              )}
            </FieldGroup>

            <div style={{ marginTop: 16, padding: "8px 12px", background: "#1e293b", borderRadius: 6, fontSize: 12, color: "#64748b" }}>
              Created: {new Date(selected.created_at).toLocaleString()} · Updated: {new Date(selected.updated_at).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Subcomponents ---

function FieldGroup({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function ReadOnlyField({ value }: { value: string }) {
  return <div style={{ color: "#64748b", fontSize: 13, fontFamily: "monospace" }}>{value}</div>;
}

function EditableField({ editing, value, onChange }: { editing: boolean; value: string; onChange: (v: string) => void }) {
  if (!editing) return <div style={{ color: "#cbd5e1", fontSize: 13 }}>{value || "—"}</div>;
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", background: "#0f172a", border: "1px solid #334155",
  borderRadius: 6, color: "#f1f5f9", fontSize: 13, outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
};
