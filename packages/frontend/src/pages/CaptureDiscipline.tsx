import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../api/auth";
import type { DisciplineDashboard, ShipleyPhase } from "@gda/shared";

const PHASE_LABELS: Record<ShipleyPhase, string> = {
  identify: "Identify",
  qualify: "Qualify",
  pursue: "Pursue",
  capture: "Capture",
  proposal: "Proposal",
  submit: "Submit",
  awarded: "Awarded",
  lost: "Lost",
  no_bid: "No Bid",
};

const PHASE_COLORS: Record<ShipleyPhase, string> = {
  identify: "#6b7280",
  qualify: "#3b82f6",
  pursue: "#22c55e",
  capture: "#f59e0b",
  proposal: "#8b5cf6",
  submit: "#06b6d4",
  awarded: "#10b981",
  lost: "#ef4444",
  no_bid: "#9ca3af",
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface, #1e293b)",
  border: "1px solid var(--color-border, #334155)",
  borderRadius: 8,
  padding: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--color-text, #e2e8f0)",
  marginBottom: 12,
};

const mutedStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-text-muted, #94a3b8)",
};

const SHIPLEY_TOOLTIP = "Industry benchmark: 3×–5× revenue goal in qualified pipeline (Capture stage or later). Source: Shipley Associates / GovEagle.";
const LOAD_TOOLTIP = "Shipley-aligned norm: 3–5 simultaneous high-quality captures per manager; 1–2 concurrent major proposals.";

export default function CaptureDiscipline() {
  const navigate = useNavigate();
  const [data, setData] = useState<DisciplineDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    authenticatedFetch("/api/discipline/dashboard")
      .then((r) => r.json())
      .then((env) => {
        if (env.success && env.data) setData(env.data);
        else setError("Failed to load discipline data");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ height: 24, width: 200, background: "#334155", borderRadius: 4, marginBottom: 16 }} />
        <div style={{ height: 200, background: "#334155", borderRadius: 8 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 24, color: "#ef4444" }}>
        {error ?? "No data available"}
      </div>
    );
  }

  const { pipeline_coverage: pc, funnel, capture_load, proposal_load, aging_captures, missing_rfp_date } = data;

  const coverageColor = pc.coverage_ratio >= pc.target_ratio
    ? "#22c55e"
    : pc.coverage_ratio >= pc.min_ratio
      ? "#f59e0b"
      : "#ef4444";

  const coveragePct = Math.min(pc.coverage_ratio / pc.target_ratio * 100, 100);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text, #e2e8f0)", margin: 0 }}>
          Capture Discipline
        </h2>
        <button
          onClick={() => navigate("/admin/discipline-config")}
          style={{
            background: "var(--color-surface, #1e293b)",
            color: "var(--color-text-muted, #94a3b8)",
            border: "1px solid var(--color-border, #334155)",
            borderRadius: 4,
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ⚙ Config
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Widget 1: Pipeline Coverage Gauge */}
        <div style={cardStyle} title={SHIPLEY_TOOLTIP}>
          <div style={titleStyle}>Pipeline Coverage</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                height: 12,
                background: "#1e293b",
                border: "1px solid var(--color-border, #334155)",
                borderRadius: 6,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${coveragePct}%`,
                  background: coverageColor,
                  borderRadius: 6,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ ...mutedStyle, marginTop: 4 }}>
                {formatCurrency(pc.qualified_value)} qualified / {formatCurrency(pc.revenue_target)} target
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: coverageColor }}>
                {pc.coverage_ratio.toFixed(1)}×
              </div>
              <div style={mutedStyle}>
                Target: {pc.min_ratio}×–{pc.target_ratio}×
              </div>
            </div>
          </div>
        </div>

        {/* Widget 2: Funnel by Shipley Phase */}
        <div style={cardStyle}>
          <div style={titleStyle}>Funnel by Phase</div>
          {funnel.length === 0 ? (
            <div style={mutedStyle}>No opportunities with Shipley phase assigned</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {funnel.map((f) => {
                const maxCount = Math.max(...funnel.map((x) => x.count), 1);
                return (
                  <div key={f.phase} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 70, fontSize: 11, color: PHASE_COLORS[f.phase], fontWeight: 600 }}>
                      {PHASE_LABELS[f.phase]}
                    </div>
                    <div style={{ flex: 1, height: 16, background: "#0f172a", borderRadius: 3 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${(f.count / maxCount) * 100}%`,
                          background: PHASE_COLORS[f.phase],
                          borderRadius: 3,
                          minWidth: f.count > 0 ? 4 : 0,
                        }}
                      />
                    </div>
                    <div style={{ width: 32, fontSize: 11, textAlign: "right", color: "var(--color-text, #e2e8f0)" }}>
                      {f.count}
                    </div>
                    <div style={{ width: 60, fontSize: 10, textAlign: "right", ...mutedStyle }}>
                      {formatCurrency(f.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Widget 3: Capture Load by Manager */}
        <div style={cardStyle} title={LOAD_TOOLTIP}>
          <div style={titleStyle}>Capture Load by Manager</div>
          {capture_load.length === 0 ? (
            <div style={mutedStyle}>No capture managers assigned</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {capture_load.map((m) => {
                const overloaded = m.active_captures >= m.max;
                return (
                  <div key={m.manager_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 120, fontSize: 11, color: "var(--color-text, #e2e8f0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.manager_id}
                    </div>
                    <div style={{ flex: 1, height: 14, background: "#0f172a", borderRadius: 3 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min((m.active_captures / (m.max + 1)) * 100, 100)}%`,
                          background: overloaded ? "#ef4444" : "#3b82f6",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <div style={{ width: 50, fontSize: 11, textAlign: "right", color: overloaded ? "#ef4444" : "var(--color-text, #e2e8f0)", fontWeight: overloaded ? 700 : 400 }}>
                      {m.active_captures}/{m.max}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Widget 4: Proposal Load by Manager */}
        <div style={cardStyle} title={LOAD_TOOLTIP}>
          <div style={titleStyle}>Proposal Load by Manager</div>
          {proposal_load.length === 0 ? (
            <div style={mutedStyle}>No proposal managers assigned</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {proposal_load.map((m) => {
                const overloaded = m.active_proposals >= m.max;
                return (
                  <div key={m.manager_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 120, fontSize: 11, color: "var(--color-text, #e2e8f0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.manager_id}
                    </div>
                    <div style={{ flex: 1, height: 14, background: "#0f172a", borderRadius: 3 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min((m.active_proposals / (m.max + 1)) * 100, 100)}%`,
                          background: overloaded ? "#ef4444" : "#8b5cf6",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <div style={{ width: 50, fontSize: 11, textAlign: "right", color: overloaded ? "#ef4444" : "var(--color-text, #e2e8f0)", fontWeight: overloaded ? 700 : 400 }}>
                      {m.active_proposals}/{m.max}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Widget 5: Aging Captures */}
        <div style={cardStyle}>
          <div style={titleStyle}>Aging Captures (no update 30+ days)</div>
          {aging_captures.length === 0 ? (
            <div style={mutedStyle}>All captures are current</div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px", ...mutedStyle, fontWeight: 600 }}>Opportunity</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", ...mutedStyle, fontWeight: 600 }}>Phase</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", ...mutedStyle, fontWeight: 600 }}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {aging_captures.map((a) => (
                    <tr
                      key={a.id}
                      style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border, #334155)" }}
                      onClick={() => navigate(`/opportunities/${a.id}`)}
                    >
                      <td style={{ padding: "4px 8px", color: "var(--color-text, #e2e8f0)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.title}
                      </td>
                      <td style={{ padding: "4px 8px", color: PHASE_COLORS[a.shipley_phase] }}>
                        {PHASE_LABELS[a.shipley_phase]}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: a.days_stale > 60 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                        {a.days_stale}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Widget 6: Pursuits Missing RFP Date */}
        <div style={cardStyle}>
          <div style={titleStyle}>Missing Expected RFP Date</div>
          {missing_rfp_date.length === 0 ? (
            <div style={mutedStyle}>All pursuits have RFP dates</div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px", ...mutedStyle, fontWeight: 600 }}>Opportunity</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", ...mutedStyle, fontWeight: 600 }}>Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {missing_rfp_date.map((m) => (
                    <tr
                      key={m.id}
                      style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border, #334155)" }}
                      onClick={() => navigate(`/opportunities/${m.id}`)}
                    >
                      <td style={{ padding: "4px 8px", color: "var(--color-text, #e2e8f0)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.title}
                      </td>
                      <td style={{ padding: "4px 8px", color: PHASE_COLORS[m.shipley_phase] }}>
                        {PHASE_LABELS[m.shipley_phase]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
