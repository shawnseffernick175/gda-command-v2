import { useState, useEffect } from "react";
import InfoBadge from "../components/InfoBadge";
import {
  fetchAnomalies,
  fetchCompetitorMovements,
  fetchEscalations,
  fetchEscalationRules,
  createEscalationRule,
  acknowledgeAnomaly,
  resolveAnomaly,
  type AnomalyRow,
  type AnomalyData,
  type CompetitorMovementRow,
  type CompetitorMovementData,
  type EscalationRow,
  type EscalationData,
  type EscalationRuleRow,
  type EscalationRulesData,
} from "../api/client";

type Tab = "anomalies" | "competitors" | "escalations" | "rules";

// ---------------------------------------------------------------------------
// Colour & label maps
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#dc2626",
  acknowledged: "#d97706",
  resolved: "#16a34a",
  dismissed: "#6b7280",
};

const THREAT_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#6b7280",
};

const ESC_PRIORITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  warning: "#d97706",
  info: "#3b82f6",
};

const ESC_STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#d97706",
  overdue: "#dc2626",
  resolved: "#16a34a",
};

const CATEGORY_LABELS: Record<string, string> = {
  pwin_drop: "Pwin Drop",
  timeline_change: "Timeline Change",
  competitor_activity: "Competitor Activity",
  financial_anomaly: "Financial Anomaly",
  resource_conflict: "Resource Conflict",
  compliance_gap: "Compliance Gap",
  incumbent_change: "Incumbent Change",
  scoring_outlier: "Scoring Outlier",
};

const MOVEMENT_LABELS: Record<string, string> = {
  contract_win: "Contract Win",
  leadership_change: "Leadership Change",
  teaming_announcement: "Teaming Announcement",
  capability_expansion: "Capability Expansion",
  merger_acquisition: "Merger/Acquisition",
  hiring_surge: "Hiring Surge",
  protest_filed: "Protest Filed",
  cpars_change: "CPARS Change",
};

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

function relTime(dt: string): string {
  const diff = Date.now() - new Date(dt).getTime();
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 1) return "< 1h ago";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      background: `${color}18`,
      color,
      border: `1px solid ${color}40`,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// Mini sparkline from trend array
// ---------------------------------------------------------------------------

function Sparkline({ data, color, width = 120, height = 32 }: { data: { date: string; value: number }[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (vals.length - 1);
  const points = vals.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────
// Anomalies Tab
// ───────────────────────────────────────────────────────────

function AnomaliesTab({ anomalies, selectedId, onSelect, onAcknowledge, onResolve }: {
  anomalies: AnomalyRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const sel = anomalies.find((a) => a.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* List */}
      <div style={{ width: 420, flexShrink: 0, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
        {anomalies.map((a) => (
          <div
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={{
              padding: 14,
              background: selectedId === a.id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: `4px solid ${SEVERITY_COLORS[a.severity] ?? "#6b7280"}`,
              borderRadius: 8,
              marginBottom: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{a.id}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <Pill label={a.severity} color={SEVERITY_COLORS[a.severity] ?? "#6b7280"} />
                <Pill label={a.status} color={STATUS_COLORS[a.status] ?? "#6b7280"} />
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{a.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Pill label={CATEGORY_LABELS[a.category] ?? a.category} color="#6366f1" />
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{relTime(a.detected_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select an anomaly to view details</div>
        ) : (
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>{sel.title}</h3>
                <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
                  <Pill label={sel.severity} color={SEVERITY_COLORS[sel.severity] ?? "#6b7280"} />
                  <Pill label={sel.status} color={STATUS_COLORS[sel.status] ?? "#6b7280"} />
                  <Pill label={CATEGORY_LABELS[sel.category] ?? sel.category} color="#6366f1" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {sel.status === "active" && (
                  <button onClick={() => onAcknowledge(sel.id)} style={{
                    padding: "6px 14px", borderRadius: 6, border: "1px solid #d97706",
                    background: "#d9770618", color: "#d97706", cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}>Acknowledge</button>
                )}
                {(sel.status === "active" || sel.status === "acknowledged") && (
                  <button onClick={() => onResolve(sel.id)} style={{
                    padding: "6px 14px", borderRadius: 6, border: "1px solid #16a34a",
                    background: "#16a34a18", color: "#16a34a", cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}>Resolve</button>
                )}
              </div>
            </div>

            {/* Description */}
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-muted)", marginBottom: 16 }}>{sel.description}</p>

            {/* Metric Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <MetricBox label="Current Value" value={formatMetricValue(sel.metric_name, sel.metric_value)} />
              <MetricBox label="Baseline" value={formatMetricValue(sel.metric_name, sel.baseline_value)} />
              <MetricBox label="Deviation" value={`${sel.deviation_pct > 0 ? "+" : ""}${sel.deviation_pct.toFixed(1)}%`}
                color={sel.deviation_pct < 0 ? "#dc2626" : sel.deviation_pct > 20 ? "#ea580c" : "#16a34a"} />
              <MetricBox label="Detected" value={relTime(sel.detected_at)} />
            </div>

            {/* Trend */}
            {sel.trend.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Trend</h4>
                <div style={{ background: "var(--color-bg)", borderRadius: 8, padding: 12, border: "1px solid var(--color-border)" }}>
                  <Sparkline data={sel.trend} color={SEVERITY_COLORS[sel.severity] ?? "#6b7280"} width={400} height={48} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-muted)", marginTop: 4 }}>
                    {sel.trend.map((p, i) => <span key={i}>{p.date.slice(5)}</span>)}
                  </div>
                </div>
              </div>
            )}

            {/* Opportunity */}
            {sel.opportunity_title && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Linked Opportunity</h4>
                <div style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{sel.opportunity_title}</span>
                  {sel.agency && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>({sel.agency})</span>}
                </div>
              </div>
            )}

            {/* Root Cause */}
            {sel.root_cause && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Root Cause</h4>
                <div style={{ padding: 10, background: "#f59e0b10", borderRadius: 8, border: "1px solid #f59e0b30", fontSize: 13 }}>
                  {sel.root_cause}
                </div>
              </div>
            )}

            {/* Recommended Actions */}
            {sel.recommended_actions.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Recommended Actions</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sel.recommended_actions.map((action, i) => (
                    <div key={i} style={{
                      padding: "8px 12px", background: "#3b82f610", borderRadius: 8,
                      border: "1px solid #3b82f630", fontSize: 13, display: "flex", gap: 8,
                    }}>
                      <span style={{ color: "#3b82f6", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 12, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function formatMetricValue(metricName: string, value: number): string {
  if (metricName.includes("probability") || metricName.includes("pwin")) return `${Math.round(value * 100)}%`;
  if (metricName.includes("pipeline_value")) return fmt$(value);
  if (metricName.includes("ratio") || metricName.includes("bid_vs")) return value.toFixed(2);
  if (metricName.includes("days")) return `${Math.round(value)}d`;
  if (metricName.includes("score") || metricName.includes("rate")) return `${Math.round(value)}`;
  return String(Math.round(value * 100) / 100);
}

// ───────────────────────────────────────────────────────────
// Competitor Movements Tab
// ───────────────────────────────────────────────────────────

function CompetitorsTab({ movements, selectedId, onSelect }: {
  movements: CompetitorMovementRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const sel = movements.find((m) => m.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* List */}
      <div style={{ width: 420, flexShrink: 0, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
        {movements.map((m) => (
          <div
            key={m.id}
            onClick={() => onSelect(m.id)}
            style={{
              padding: 14,
              background: selectedId === m.id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: `4px solid ${THREAT_COLORS[m.threat_level] ?? "#6b7280"}`,
              borderRadius: 8,
              marginBottom: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>{m.competitor_name}</span>
              <Pill label={m.threat_level} color={THREAT_COLORS[m.threat_level] ?? "#6b7280"} />
            </div>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{m.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Pill label={MOVEMENT_LABELS[m.movement_type] ?? m.movement_type} color="#8b5cf6" />
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{relTime(m.detected_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select a movement to view details</div>
        ) : (
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{sel.title}</h3>
                {sel.verified && <Pill label="Verified" color="#16a34a" />}
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <Pill label={sel.competitor_name} color="#6366f1" />
                <Pill label={MOVEMENT_LABELS[sel.movement_type] ?? sel.movement_type} color="#8b5cf6" />
                <Pill label={sel.threat_level} color={THREAT_COLORS[sel.threat_level] ?? "#6b7280"} />
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-muted)", marginBottom: 16 }}>{sel.description}</p>

            {/* Impact Assessment */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Impact Assessment</h4>
              <div style={{
                padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                background: sel.threat_level === "critical" ? "#dc262610" : sel.threat_level === "high" ? "#ea580c10" : "#6b728010",
                border: `1px solid ${(THREAT_COLORS[sel.threat_level] ?? "#6b7280")}30`,
              }}>{sel.impact_assessment}</div>
            </div>

            {/* Source */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Source</h4>
              <div style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{sel.source}</span>
                {sel.source_url && (
                  <a href={sel.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: 8, color: "#3b82f6", fontSize: 12 }}>[link]</a>
                )}
              </div>
            </div>

            {/* Affected Opportunities */}
            {sel.affected_opportunities.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Affected Opportunities</h4>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sel.affected_opportunities.map((opp) => (
                    <Pill key={opp} label={opp} color="#3b82f6" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Escalations Tab
// ───────────────────────────────────────────────────────────

function EscalationsTab({ escalations, selectedId, onSelect }: {
  escalations: EscalationRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const sel = escalations.find((e) => e.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* List */}
      <div style={{ width: 420, flexShrink: 0, maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
        {escalations.map((e) => (
          <div
            key={e.id}
            onClick={() => onSelect(e.id)}
            style={{
              padding: 14,
              background: selectedId === e.id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: `4px solid ${ESC_PRIORITY_COLORS[e.priority] ?? "#6b7280"}`,
              borderRadius: 8,
              marginBottom: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{e.id}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <Pill label={e.priority} color={ESC_PRIORITY_COLORS[e.priority] ?? "#6b7280"} />
                <Pill label={e.status} color={ESC_STATUS_COLORS[e.status] ?? "#6b7280"} />
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{e.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{e.assigned_to ?? "Unassigned"}</span>
              {e.days_overdue > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>{e.days_overdue}d overdue</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select an escalation to view details</div>
        ) : (
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{sel.title}</h3>
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <Pill label={sel.priority} color={ESC_PRIORITY_COLORS[sel.priority] ?? "#6b7280"} />
                <Pill label={sel.status} color={ESC_STATUS_COLORS[sel.status] ?? "#6b7280"} />
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-muted)", marginBottom: 16 }}>{sel.description}</p>

            {/* Info Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2, textTransform: "uppercase" }}>Assigned To</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{sel.assigned_to ?? "Unassigned"}</div>
              </div>
              <div style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2, textTransform: "uppercase" }}>Due Date</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: sel.days_overdue > 0 ? "#dc2626" : "var(--color-text)" }}>
                  {sel.due_date ? new Date(sel.due_date).toLocaleDateString() : "N/A"}
                  {sel.days_overdue > 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>({sel.days_overdue}d overdue)</span>}
                </div>
              </div>
              <div style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2, textTransform: "uppercase" }}>Triggered</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{relTime(sel.triggered_at)}</div>
              </div>
            </div>

            {/* Rule */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Triggered Rule</h4>
              <div style={{ padding: 10, background: "#6366f110", borderRadius: 8, border: "1px solid #6366f130", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{sel.rule_name}</span>
                <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>({sel.rule_id})</span>
              </div>
            </div>

            {/* Linked Opportunity */}
            {sel.opportunity_title && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Linked Opportunity</h4>
                <div style={{ padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{sel.opportunity_title}</span>
                  {sel.agency && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>({sel.agency})</span>}
                </div>
              </div>
            )}

            {/* Resolution Notes */}
            {sel.resolution_notes && (
              <div>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Resolution Notes</h4>
                <div style={{ padding: 10, background: "#16a34a10", borderRadius: 8, border: "1px solid #16a34a30", fontSize: 13 }}>
                  {sel.resolution_notes}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Escalation Rules Tab
// ───────────────────────────────────────────────────────────

function RulesTab({ rules, onRuleAdded }: { rules: EscalationRuleRow[]; onRuleAdded: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCondition, setNewCondition] = useState("");
  const [newPriority, setNewPriority] = useState("warning");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim() || !newCondition.trim()) return;
    setSaving(true);
    try {
      await createEscalationRule({ name: newName, condition: newCondition, priority: newPriority, description: newDesc });
      setNewName(""); setNewCondition(""); setNewDesc(""); setShowForm(false);
      onRuleAdded();
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ padding: 14, background: "rgba(59,130,246,0.06)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.15)", marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
        <strong>How Rules Work:</strong> Rules define the conditions that trigger anomaly alerts and escalations. They are evaluated continuously against incoming opportunity data, competitor activity, and financial metrics. When a rule's condition is met, an anomaly is created and (optionally) escalated for review.
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          {showForm ? "Cancel" : "+ Add Rule"}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: 16, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Rule name (e.g., Pwin Drop > 15%)" style={{ padding: "8px 12px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: 13 }} />
            <input value={newCondition} onChange={(e) => setNewCondition(e.target.value)} placeholder="Condition (e.g., pwin_change < -0.15)" style={{ padding: "8px 12px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: 13, fontFamily: "monospace" }} />
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={{ padding: "8px 12px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: 13 }}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2} style={{ padding: "8px 12px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: 13, resize: "vertical" }} />
            <button onClick={handleAdd} disabled={saving || !newName.trim() || !newCondition.trim()} style={{ padding: "8px 16px", background: saving ? "#6b7280" : "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, justifySelf: "start" }}>
              {saving ? "Saving..." : "Save Rule"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rules.map((r) => (
          <div key={r.id} style={{
            padding: 16,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderLeft: `4px solid ${ESC_PRIORITY_COLORS[r.priority] ?? "#6b7280"}`,
            borderRadius: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Pill label={r.priority} color={ESC_PRIORITY_COLORS[r.priority] ?? "#6b7280"} />
              </div>
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 12, padding: "8px 12px",
              background: "var(--color-bg)", borderRadius: 6, border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}>
              {r.condition}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Main Page
// ───────────────────────────────────────────────────────────

export default function AnomalyDetection() {
  const [tab, setTab] = useState<Tab>("anomalies");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [anomalyData, setAnomalyData] = useState<AnomalyData | null>(null);
  const [movementData, setMovementData] = useState<CompetitorMovementData | null>(null);
  const [escalationData, setEscalationData] = useState<EscalationData | null>(null);
  const [rulesData, setRulesData] = useState<EscalationRulesData | null>(null);

  const [selectedAnomaly, setSelectedAnomaly] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [selectedEscalation, setSelectedEscalation] = useState<string | null>(null);

  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAnomalies(),
      fetchCompetitorMovements(),
      fetchEscalations(),
      fetchEscalationRules(),
    ])
      .then(([anomEnv, movEnv, escEnv, rulesEnv]) => {
        if (anomEnv.success && anomEnv.data) setAnomalyData(anomEnv.data);
        if (movEnv.success && movEnv.data) setMovementData(movEnv.data);
        if (escEnv.success && escEnv.data) setEscalationData(escEnv.data);
        if (rulesEnv.success && rulesEnv.data) setRulesData(rulesEnv.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading anomaly detection data...</div>;
  if (error) return <div style={{ padding: 40, color: "#dc2626" }}>Error: {error}</div>;

  const anomalies = anomalyData?.anomalies ?? [];
  const movements = movementData?.movements ?? [];
  const escalations = escalationData?.escalations ?? [];
  const rules = rulesData?.rules ?? [];

  // Filtering
  const filteredAnomalies = anomalies.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return a.title.toLowerCase().includes(s) || a.description.toLowerCase().includes(s) || (a.agency ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  const filteredMovements = movements.filter((m) => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return m.title.toLowerCase().includes(s) || m.competitor_name.toLowerCase().includes(s) || m.description.toLowerCase().includes(s);
    }
    return true;
  });

  const filteredEscalations = escalations.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return e.title.toLowerCase().includes(s) || e.description.toLowerCase().includes(s) || (e.agency ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAnomaly(id);
    } catch { /* dry-run, ignore */ }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveAnomaly(id);
    } catch { /* dry-run, ignore */ }
  };

  // Summary counts
  const totalAnomalies = anomalies.length;
  const activeAnomalies = anomalyData?.active ?? 0;
  const criticalCount = anomalyData?.critical ?? 0;
  const highCount = anomalyData?.high ?? 0;
  const totalMovements = movementData?.total ?? 0;
  const uniqueCompetitors = movementData?.competitors ?? 0;
  const totalEscalations = escalationData?.total ?? 0;
  const overdueEscalations = escalationData?.overdue ?? 0;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "anomalies", label: "Anomalies", count: totalAnomalies },
    { key: "competitors", label: "Competitor Movements", count: totalMovements },
    { key: "escalations", label: "Escalations", count: totalEscalations },
    { key: "rules", label: "Rules", count: rules.length },
  ];

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Anomaly Detection & Proactive Alerts</h2>

      {/* Summary Strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: 12,
        marginBottom: 20,
      }}>
        <SummaryBox label="Anomalies" value={String(totalAnomalies)} onClick={() => { setTab("anomalies"); setSeverityFilter(""); setStatusFilter(""); }} />
        <SummaryBox label="Active" value={String(activeAnomalies)} color="#dc2626" onClick={() => { setTab("anomalies"); setStatusFilter("active"); setSeverityFilter(""); }} />
        <SummaryBox label="Critical" value={String(criticalCount)} color="#dc2626" onClick={() => { setTab("anomalies"); setSeverityFilter("critical"); setStatusFilter(""); }} />
        <SummaryBox label="High" value={String(highCount)} color="#ea580c" onClick={() => { setTab("anomalies"); setSeverityFilter("high"); setStatusFilter(""); }} />
        <SummaryBox label="Movements" value={String(totalMovements)} onClick={() => { setTab("competitors"); }} />
        <SummaryBox label="Competitors" value={String(uniqueCompetitors)} onClick={() => { setTab("competitors"); }} />
        <SummaryBox label="Escalations" value={String(totalEscalations)} onClick={() => { setTab("escalations"); setStatusFilter(""); }} />
        <SummaryBox label="Overdue" value={String(overdueEscalations)} color={overdueEscalations > 0 ? "#dc2626" : undefined} onClick={() => { setTab("escalations"); setStatusFilter("overdue"); }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--color-border)", marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearchTerm(""); setSeverityFilter(""); setStatusFilter(""); }}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #3b82f6" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? "#3b82f6" : "var(--color-text-muted)",
              fontSize: 14,
              marginBottom: -2,
            }}
          >
            {t.label} <span style={{ fontSize: 11, opacity: 0.7 }}>({t.count})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder={tab === "competitors" ? "Search competitors..." : "Search..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13, width: 260,
          }}
        />

        {tab === "anomalies" && (
          <>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
              background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13,
            }}>
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
              background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13,
            }}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </>
        )}

        {tab === "escalations" && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{
            padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13,
          }}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="overdue">Overdue</option>
            <option value="resolved">Resolved</option>
          </select>
        )}

        {(searchTerm || severityFilter || statusFilter) && (
          <button onClick={() => { setSearchTerm(""); setSeverityFilter(""); setStatusFilter(""); }} style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: "var(--color-surface)", color: "var(--color-text)", cursor: "pointer", fontSize: 13,
          }}>Clear</button>
        )}

        <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: "auto" }}>
          {tab === "anomalies" && `${filteredAnomalies.length} of ${totalAnomalies}`}
          {tab === "competitors" && `${filteredMovements.length} of ${totalMovements}`}
          {tab === "escalations" && `${filteredEscalations.length} of ${totalEscalations}`}
        </span>
      </div>

      {/* Tab Content */}
      {tab === "anomalies" && (
        <AnomaliesTab
          anomalies={filteredAnomalies}
          selectedId={selectedAnomaly}
          onSelect={setSelectedAnomaly}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
        />
      )}
      {tab === "competitors" && (
        <CompetitorsTab
          movements={filteredMovements}
          selectedId={selectedMovement}
          onSelect={setSelectedMovement}
        />
      )}
      {tab === "escalations" && (
        <EscalationsTab
          escalations={filteredEscalations}
          selectedId={selectedEscalation}
          onSelect={setSelectedEscalation}
        />
      )}
      {tab === "rules" && <RulesTab rules={rules} onRuleAdded={() => { fetchEscalationRules().then((env) => { if (env.success && env.data) setRulesData(env.data); }); }} />}
    </div>
  );
}

const SUMMARY_INFO: Record<string, { whatItIs: string; whatItMeans: string; howCalculated?: string }> = {
  "Anomalies": {
    whatItIs: "Total detected anomalies across all categories and severities.",
    whatItMeans: "Higher count means more potential issues need review. Zero is ideal.",
    howCalculated: "Count of all anomaly records in the system regardless of status.",
  },
  "Active": {
    whatItIs: "Anomalies that have not yet been acknowledged or resolved.",
    whatItMeans: "Items requiring attention. Acknowledge to mark as reviewed, resolve to close.",
    howCalculated: "Count of anomalies with status = 'active' (not acknowledged or resolved).",
  },
  "Critical": {
    whatItIs: "Anomalies with critical severity requiring immediate attention.",
    whatItMeans: "These could impact active captures or contract performance. Act within hours.",
    howCalculated: "Count of anomalies where severity = 'critical'.",
  },
  "High": {
    whatItIs: "Anomalies with high severity — should be reviewed within 24 hours.",
    whatItMeans: "Potential risks that need prompt evaluation and mitigation planning.",
    howCalculated: "Count of anomalies where severity = 'high'.",
  },
  "Movements": {
    whatItIs: "Competitor actions detected (contract wins, teaming, hiring, etc.).",
    whatItMeans: "Tracks competitor behavior that may impact your pipeline positioning.",
    howCalculated: "Count of competitor movement records from intel feeds and monitoring.",
  },
  "Competitors": {
    whatItIs: "Unique competitors tracked with recent activity.",
    whatItMeans: "Number of distinct competitors being monitored across your opportunity space.",
    howCalculated: "Count of unique competitor names across all movement records.",
  },
  "Escalations": {
    whatItIs: "Items escalated for management review or decision.",
    whatItMeans: "Issues that require leadership attention — bid/no-bid decisions, risk acceptance, etc.",
    howCalculated: "Count of escalation records created by rules or manual escalation.",
  },
  "Overdue": {
    whatItIs: "Escalations past their resolution deadline.",
    whatItMeans: "These items need immediate resolution — delays may impact capture timelines.",
    howCalculated: "Count of escalations where status = 'overdue' based on SLA deadlines.",
  },
};

function SummaryBox({ label, value, color, onClick }: { label: string; value: string; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 8px",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        textAlign: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = color ?? "#3b82f6"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
    >
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {label}
        {SUMMARY_INFO[label] && (
          <InfoBadge {...SUMMARY_INFO[label]} size={14} />
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}
