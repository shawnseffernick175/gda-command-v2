import { useEffect, useState } from "react";
import { authenticatedFetch } from "../api/auth";
import { SHIPLEY_STAGES } from "../api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FunnelEntry {
  stage: string;
  count: string;
  total_value: string;
}

interface GateSummaryEntry {
  gate: string;
  status: string;
  count: string;
}

interface GuardrailAlert {
  id: string;
  opportunity_id: string;
  rule: string;
  severity: string;
  message: string;
  resolved: boolean;
  created_at: string;
  opp_title: string;
}

interface DashboardMetrics {
  total: number;
  with_gates: number;
  overdue: number;
  at_risk: number;
}

interface DashboardData {
  funnel: FunnelEntry[];
  gate_summary: GateSummaryEntry[];
  alerts: GuardrailAlert[];
  metrics: DashboardMetrics;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(val: number | string | null): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (!n) return "$0";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function stageLabel(stage: string): string {
  const found = SHIPLEY_STAGES.find((s) => s.value === stage);
  return found?.label ?? stage.replace(/_/g, " ");
}

function stageColor(stage: string): string {
  const found = SHIPLEY_STAGES.find((s) => s.value === stage);
  return found?.color ?? "#6b7280";
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

const GATE_STATUS_COLORS: Record<string, string> = {
  passed: "#22c55e",
  failed: "#ef4444",
  pending: "#f59e0b",
  waived: "#6b7280",
  deferred: "#8b5cf6",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CaptureDiscipline() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authenticatedFetch("/api/capture-discipline/dashboard")
      .then((r) => r.json())
      .then((env: { success: boolean; data: DashboardData | null }) => {
        if (env.success && env.data) setData(env.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resolveAlert = async (alertId: string) => {
    try {
      await authenticatedFetch(`/api/capture-discipline/alerts/${alertId}/resolve`, {
        method: "POST",
      });
      setData((prev) =>
        prev
          ? { ...prev, alerts: prev.alerts.filter((a) => a.id !== alertId) }
          : prev
      );
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.pageTitle}>Capture Discipline</h1>
        <p style={{ color: "#94a3b8" }}>Loading dashboard...</p>
      </div>
    );
  }

  const d = data ?? {
    funnel: [],
    gate_summary: [],
    alerts: [],
    metrics: { total: 0, with_gates: 0, overdue: 0, at_risk: 0 },
  };

  // Build gate summary matrix
  const gates = ["qualify", "pursue", "solicitation", "post_submittal", "bid_validation"];
  const gateStatuses = ["passed", "failed", "pending", "waived", "deferred"];
  const gateMatrix: Record<string, Record<string, number>> = {};
  for (const g of gates) {
    gateMatrix[g] = {};
    for (const s of gateStatuses) gateMatrix[g][s] = 0;
  }
  for (const row of d.gate_summary) {
    if (gateMatrix[row.gate]) {
      gateMatrix[row.gate][row.status] = Number(row.count);
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Capture Discipline</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24, fontSize: 14 }}>
        Shipley-aligned capture process dashboard — stage funnel, gate reviews, and guardrail alerts.
      </p>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Active Opportunities</div>
          <div style={styles.kpiValue}>{d.metrics.total}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>With Gate Reviews</div>
          <div style={{ ...styles.kpiValue, color: "#3b82f6" }}>{d.metrics.with_gates}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Overdue</div>
          <div style={{ ...styles.kpiValue, color: d.metrics.overdue > 0 ? "#ef4444" : "#22c55e" }}>{d.metrics.overdue}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>At Risk</div>
          <div style={{ ...styles.kpiValue, color: d.metrics.at_risk > 0 ? "#f59e0b" : "#22c55e" }}>{d.metrics.at_risk}</div>
        </div>
      </div>

      {/* Stage Funnel */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Stage Funnel</h2>
        {d.funnel.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>No active opportunities.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.funnel.map((f) => {
              const maxCount = Math.max(...d.funnel.map((x) => Number(x.count)), 1);
              const pct = (Number(f.count) / maxCount) * 100;
              return (
                <div key={f.stage} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 120, fontSize: 13, fontWeight: 600, color: stageColor(f.stage), textTransform: "capitalize" }}>
                    {stageLabel(f.stage)}
                  </div>
                  <div style={{ flex: 1, height: 28, background: "rgba(255,255,255,0.04)", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: stageColor(f.stage),
                        opacity: 0.25,
                        borderRadius: 4,
                        transition: "width 0.3s",
                      }}
                    />
                    <div style={{ position: "absolute", top: 0, left: 8, lineHeight: "28px", fontSize: 12, fontWeight: 700 }}>
                      {f.count} opps · {formatCurrency(f.total_value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gate Review Matrix */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Gate Review Summary</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Gate</th>
              {gateStatuses.map((s) => (
                <th key={s} style={{ ...styles.th, textTransform: "capitalize" }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gates.map((gate) => (
              <tr key={gate}>
                <td style={{ ...styles.td, fontWeight: 600, textTransform: "capitalize" }}>{gate.replace(/_/g, " ")}</td>
                {gateStatuses.map((s) => (
                  <td key={s} style={styles.td}>
                    {gateMatrix[gate][s] > 0 ? (
                      <span style={{ color: GATE_STATUS_COLORS[s], fontWeight: 700 }}>{gateMatrix[gate][s]}</span>
                    ) : (
                      <span style={{ color: "#374151" }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Guardrail Alerts */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          Guardrail Alerts
          {d.alerts.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#ef4444", fontWeight: 400 }}>
              ({d.alerts.length} active)
            </span>
          )}
        </h2>
        {d.alerts.length === 0 ? (
          <p style={{ color: "#22c55e", fontStyle: "italic" }}>No active guardrail alerts. All clear.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.02)",
                  borderLeft: `3px solid ${SEVERITY_COLORS[alert.severity] ?? "#6b7280"}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{alert.message}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {alert.rule.replace(/_/g, " ")} · {alert.severity} · {new Date(alert.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => resolveAlert(alert.id)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 24,
    color: "#e2e8f0",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 4,
  },
  section: {
    marginBottom: 28,
    padding: 20,
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
  },
  kpiCard: {
    padding: "16px 20px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    textAlign: "center" as const,
  },
  kpiLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#e2e8f0",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    textAlign: "left" as const,
    color: "#64748b",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "top" as const,
  },
};
