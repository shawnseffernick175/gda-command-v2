import { useState, useEffect } from "react";
import {
  fetchPwinModels,
  fetchPipelineForecast,
  fetchBidAssessments,
  fetchWinLossAnalysis,
  type PwinModelData,
  type PipelineForecastData,
  type BidAssessmentData,
  type BidAssessmentsListData,
  type WinLossAnalysisData,
} from "../api/client";

type Tab = "pwin" | "forecast" | "bid" | "patterns";

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const SIGNAL_COLORS: Record<string, string> = {
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
};

const IMPACT_COLORS: Record<string, string> = {
  positive: "#16a34a",
  negative: "#dc2626",
  neutral: "#6b7280",
};

const TREND_ICON: Record<string, string> = {
  improving: "^",
  stable: "-",
  declining: "v",
};

const TREND_COLOR: Record<string, string> = {
  improving: "#16a34a",
  declining: "#dc2626",
  stable: "#6b7280",
};

// ───────────────────────────────────────────────────────────
// Pwin Models Tab
// ───────────────────────────────────────────────────────────

function PwinModelsTab({ models, selectedId, onSelect }: {
  models: PwinModelData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = models.find((m) => m.opp_id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* List */}
      <div style={{ width: 380, flexShrink: 0 }}>
        {models.map((m) => (
          <div
            key={m.opp_id}
            onClick={() => onSelect(m.opp_id)}
            style={{
              padding: 14,
              background: selectedId === m.opp_id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              marginBottom: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>{m.opp_title}</strong>
              <span style={{ color: TREND_COLOR[m.trend], fontWeight: 700, fontSize: 18 }}>
                {pct(m.ml_pwin)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
              <span>{m.agency}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: TREND_COLOR[m.trend], fontWeight: 600 }}>
                  {TREND_ICON[m.trend]} {m.trend_delta >= 0 ? "+" : ""}{Math.round(m.trend_delta * 100)}%
                </span>
                <span style={{
                  background: m.confidence_level === "high" ? "#dcfce7" : m.confidence_level === "medium" ? "#fef3c7" : "#fee2e2",
                  color: m.confidence_level === "high" ? "#16a34a" : m.confidence_level === "medium" ? "#d97706" : "#dc2626",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 10,
                  textTransform: "uppercase",
                }}>{m.confidence_level}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1 }}>
        {!selected ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
            Select an opportunity to view ML Pwin analysis
          </div>
        ) : (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>{selected.opp_title}</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
              {selected.agency} &middot; Model: {selected.model_version} &middot; Updated: {new Date(selected.last_updated).toLocaleDateString()}
            </div>

            {/* ML vs Static comparison */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20,
              background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16,
            }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>ML Pwin</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{pct(selected.ml_pwin)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Static Pwin</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-muted)" }}>{pct(selected.static_pwin)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Confidence Range</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{pct(selected.confidence_interval.lower)}-{pct(selected.confidence_interval.upper)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Similar Opps</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  <span style={{ color: "#16a34a" }}>{selected.similar_opps_won}W</span>
                  {" / "}
                  <span style={{ color: "#dc2626" }}>{selected.similar_opps_lost}L</span>
                </div>
              </div>
            </div>

            {/* Feature Importance */}
            <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Feature Importance</h4>
            <div style={{ marginBottom: 20 }}>
              {selected.features.map((f, i) => (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "140px 50px 1fr 40px",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                  <span style={{ color: IMPACT_COLORS[f.impact], fontWeight: 600 }}>
                    {f.impact === "positive" ? "+" : f.impact === "negative" ? "-" : "="}
                  </span>
                  <div style={{ position: "relative", height: 16, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      width: `${f.importance * 100 / 0.25}%`,
                      height: "100%",
                      background: IMPACT_COLORS[f.impact],
                      borderRadius: 4,
                      opacity: 0.6,
                    }} />
                    <span style={{
                      position: "absolute",
                      left: 6,
                      top: 0,
                      lineHeight: "16px",
                      fontSize: 10,
                      color: "#374151",
                    }}>{f.value}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(f.importance * 100)}%</span>
                </div>
              ))}
            </div>

            {/* Improvement Actions */}
            <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Pwin Improvement Actions</h4>
            <div>
              {selected.improvement_actions.map((a, i) => (
                <div key={i} style={{
                  padding: 12,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.action}</span>
                    <span style={{
                      background: "#dcfce7",
                      color: "#16a34a",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                    }}>+{Math.round(a.estimated_pwin_lift * 100)}% Pwin</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
                    <span>Effort: <span style={{
                      color: a.effort === "low" ? "#16a34a" : a.effort === "medium" ? "#d97706" : "#dc2626",
                      fontWeight: 600,
                    }}>{a.effort}</span></span>
                    {a.deadline && <span>Due: {new Date(a.deadline).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Forecast Tab
// ───────────────────────────────────────────────────────────

function ForecastTab({ data }: { data: PipelineForecastData }) {
  const s = data.summary;
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20,
        background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16,
      }}>
        {[
          { label: "Total Pipeline", value: fmt$(s.total_pipeline) },
          { label: "Weighted Pipeline", value: fmt$(s.weighted_pipeline) },
          { label: "P10 (Conservative)", value: fmt$(s.p10_revenue), color: "#dc2626" },
          { label: "P50 (Base Case)", value: fmt$(s.p50_revenue), color: "#7c3aed" },
          { label: "P90 (Optimistic)", value: fmt$(s.p90_revenue), color: "#16a34a" },
          { label: "Annual Target", value: fmt$(s.annual_target) },
          { label: "Gap to Target", value: fmt$(s.gap_to_target), color: s.gap_to_target > 0 ? "#dc2626" : "#16a34a" },
          { label: "Coverage Ratio", value: `${s.pipeline_coverage_ratio.toFixed(1)}x` },
        ].map((kpi, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Monthly Forecast Table */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Monthly Revenue Forecast ({s.simulations_run.toLocaleString()} simulations)</h4>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Month</th>
              <th style={{ textAlign: "right", padding: 8, color: "#dc2626" }}>P10</th>
              <th style={{ textAlign: "right", padding: 8, color: "#7c3aed" }}>P50</th>
              <th style={{ textAlign: "right", padding: 8, color: "#16a34a" }}>P90</th>
              <th style={{ textAlign: "right", padding: 8 }}>Target</th>
              <th style={{ textAlign: "right", padding: 8 }}>Actuals</th>
              <th style={{ textAlign: "right", padding: 8 }}>vs Target</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map((m, i) => {
              const actual = m.actuals;
              const delta = actual !== null ? actual - m.target : null;
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", background: actual === null ? "transparent" : "var(--color-surface)" }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{m.month}</td>
                  <td style={{ padding: 8, textAlign: "right", color: "#dc2626" }}>{fmt$(m.p10)}</td>
                  <td style={{ padding: 8, textAlign: "right", color: "#7c3aed" }}>{fmt$(m.p50)}</td>
                  <td style={{ padding: 8, textAlign: "right", color: "#16a34a" }}>{fmt$(m.p90)}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>{fmt$(m.target)}</td>
                  <td style={{ padding: 8, textAlign: "right", fontWeight: actual !== null ? 700 : 400 }}>
                    {actual !== null ? fmt$(actual) : "—"}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", color: delta !== null ? (delta >= 0 ? "#16a34a" : "#dc2626") : "var(--color-text-muted)", fontWeight: 600 }}>
                    {delta !== null ? `${delta >= 0 ? "+" : ""}${fmt$(delta)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top Contributors */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Top Pipeline Contributors</h4>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Opportunity</th>
              <th style={{ textAlign: "left", padding: 8 }}>Agency</th>
              <th style={{ textAlign: "right", padding: 8 }}>Value</th>
              <th style={{ textAlign: "right", padding: 8 }}>Pwin</th>
              <th style={{ textAlign: "right", padding: 8 }}>Weighted</th>
              <th style={{ textAlign: "left", padding: 8 }}>Close</th>
              <th style={{ textAlign: "left", padding: 8 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.top_contributors.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{c.title}</td>
                <td style={{ padding: 8, color: "var(--color-text-muted)" }}>{c.agency}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{fmt$(c.value)}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>{pct(c.pwin)}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>{fmt$(c.weighted_value)}</td>
                <td style={{ padding: 8 }}>{new Date(c.expected_close).toLocaleDateString()}</td>
                <td style={{ padding: 8 }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    background: c.status === "proposal" ? "#dbeafe" : c.status === "capture" ? "#fef3c7" : c.status === "evaluate" ? "#f3e8ff" : "#dcfce7",
                    color: c.status === "proposal" ? "#2563eb" : c.status === "capture" ? "#d97706" : c.status === "evaluate" ? "#7c3aed" : "#16a34a",
                  }}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Risk Factors */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Forecast Risk Factors</h4>
      <div>
        {data.risk_factors.map((r) => (
          <div key={r.id} style={{
            padding: 12,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            marginBottom: 8,
            cursor: "pointer",
          }} onClick={() => setExpandedRisk(expandedRisk === r.id ? null : r.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: r.severity === "critical" ? "#fee2e2" : r.severity === "high" ? "#fef3c7" : "#dbeafe",
                  color: r.severity === "critical" ? "#dc2626" : r.severity === "high" ? "#d97706" : "#2563eb",
                }}>{r.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.risk}</span>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: "#dc2626" }}>{fmt$(r.impact_revenue)}</span>
                <span style={{ color: "var(--color-text-muted)" }}>{pct(r.probability)} prob</span>
              </div>
            </div>
            {expandedRisk === r.id && (
              <div style={{ marginTop: 8, padding: 10, background: "#f0f9ff", borderRadius: 6, fontSize: 12, color: "#1e40af" }}>
                <strong>Mitigation:</strong> {r.mitigation}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Bid/No-Bid Tab
// ───────────────────────────────────────────────────────────

function BidNoBidTab({ data, selectedId, onSelect }: {
  data: BidAssessmentsListData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = data.assessments.find((a) => a.opp_id === selectedId) ?? null;

  const recColor = (r: string) => r === "bid" ? "#16a34a" : r === "no_bid" ? "#dc2626" : "#d97706";
  const recBg = (r: string) => r === "bid" ? "#dcfce7" : r === "no_bid" ? "#fee2e2" : "#fef3c7";
  const recLabel = (r: string) => r === "bid" ? "BID" : r === "no_bid" ? "NO-BID" : "WATCH";

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Summary + List */}
      <div style={{ width: 380, flexShrink: 0 }}>
        {/* Quick summary */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12,
          background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{data.bid}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600 }}>BID</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#d97706" }}>{data.watch}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600 }}>WATCH</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{data.no_bid}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600 }}>NO-BID</div>
          </div>
        </div>

        {data.assessments.map((a) => (
          <div
            key={a.opp_id}
            onClick={() => onSelect(a.opp_id)}
            style={{
              padding: 14,
              background: selectedId === a.opp_id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              marginBottom: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>{a.opp_title}</strong>
              <span style={{
                padding: "3px 10px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                background: recBg(a.recommendation),
                color: recColor(a.recommendation),
              }}>{recLabel(a.recommendation)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
              <span>{a.agency}</span>
              <span>Score: <strong>{a.overall_score}</strong>/100 &middot; {fmt$(a.value)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1 }}>
        {!selected ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
            Select an opportunity to view bid/no-bid assessment
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{selected.opp_title}</h3>
              <span style={{
                padding: "6px 16px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 700,
                background: recBg(selected.recommendation),
                color: recColor(selected.recommendation),
              }}>{recLabel(selected.recommendation)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
              {selected.agency} &middot; {fmt$(selected.value)} &middot; Score: {selected.overall_score}/100
              &middot; Strategic: <span style={{
                color: selected.strategic_alignment === "high" ? "#16a34a" : selected.strategic_alignment === "medium" ? "#d97706" : "#dc2626",
                fontWeight: 600,
              }}>{selected.strategic_alignment}</span>
            </div>

            {/* Factor Scorecard */}
            <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Assessment Factors</h4>
            <div style={{ marginBottom: 20 }}>
              {selected.factors.map((f, i) => (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 50px",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: SIGNAL_COLORS[f.signal],
                    }} />
                    {f.category}
                  </span>
                  <div style={{ position: "relative", height: 20, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      width: `${f.score}%`,
                      height: "100%",
                      background: SIGNAL_COLORS[f.signal],
                      borderRadius: 4,
                      opacity: 0.5,
                    }} />
                    <span style={{
                      position: "absolute",
                      left: 8,
                      top: 2,
                      fontSize: 10,
                      color: "#374151",
                      lineHeight: "16px",
                    }}>{f.notes}</span>
                  </div>
                  <span style={{ fontWeight: 700, textAlign: "right", color: SIGNAL_COLORS[f.signal] }}>{f.score}</span>
                </div>
              ))}
            </div>

            {/* Rationale */}
            <div style={{
              padding: 14,
              background: recBg(selected.recommendation),
              border: `1px solid ${recColor(selected.recommendation)}33`,
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              <strong>Rationale:</strong> {selected.rationale}
            </div>

            {/* Resource Impact */}
            <div style={{
              padding: 14,
              background: "#f0f9ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              <strong>Resource Impact:</strong> {selected.resource_impact}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Win/Loss Patterns Tab
// ───────────────────────────────────────────────────────────

function WinLossTab({ data }: { data: WinLossAnalysisData }) {
  const s = data.summary;
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 20,
        background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16,
      }}>
        {[
          { label: "Total Opps", value: String(s.total_opportunities) },
          { label: "Wins", value: String(s.total_wins), color: "#16a34a" },
          { label: "Losses", value: String(s.total_losses), color: "#dc2626" },
          { label: "Win Rate", value: pct(s.overall_win_rate), color: s.overall_win_rate >= 0.40 ? "#16a34a" : "#dc2626" },
          { label: "Model Accuracy", value: pct(s.avg_pwin_accuracy), color: "#7c3aed" },
          { label: "Value Won", value: fmt$(s.total_value_won), color: "#16a34a" },
          { label: "Value Lost", value: fmt$(s.total_value_lost), color: "#dc2626" },
          { label: "Calibration", value: s.model_calibration.replace("_", " ") },
        ].map((kpi, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color, textTransform: "capitalize" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Key Patterns */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Key Patterns ({s.analysis_period})</h4>
      <div style={{ marginBottom: 20 }}>
        {data.patterns.map((p) => (
          <div key={p.id} style={{
            padding: 14,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            marginBottom: 8,
            cursor: "pointer",
          }} onClick={() => setExpandedPattern(expandedPattern === p.id ? null : p.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: p.direction === "positive" ? "#16a34a" : p.direction === "negative" ? "#dc2626" : "#6b7280",
                }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.insight}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: "#f3e8ff",
                  color: "#7c3aed",
                }}>{p.category}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {pct(p.confidence)} conf &middot; n={p.sample_size}
                </span>
              </div>
            </div>
            {expandedPattern === p.id && (
              <div style={{ marginTop: 10, padding: 12, background: "#f8fafc", borderRadius: 6, fontSize: 12, lineHeight: 1.6, color: "#374151" }}>
                {p.detail}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Agency Performance */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Agency Performance</h4>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Agency</th>
              <th style={{ textAlign: "right", padding: 8 }}>Wins</th>
              <th style={{ textAlign: "right", padding: 8 }}>Losses</th>
              <th style={{ textAlign: "right", padding: 8 }}>Win Rate</th>
              <th style={{ textAlign: "right", padding: 8 }}>Value Won</th>
              <th style={{ textAlign: "right", padding: 8 }}>Model Accuracy</th>
              <th style={{ textAlign: "left", padding: 8 }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.agency_performance.map((a, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{a.agency}</td>
                <td style={{ padding: 8, textAlign: "right", color: "#16a34a" }}>{a.wins}</td>
                <td style={{ padding: 8, textAlign: "right", color: "#dc2626" }}>{a.losses}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: a.win_rate >= 0.40 ? "#16a34a" : a.win_rate >= 0.30 ? "#d97706" : "#dc2626" }}>
                  {pct(a.win_rate)}
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>{fmt$(a.total_value_won)}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{pct(a.avg_pwin_accuracy)}</td>
                <td style={{ padding: 8 }}>
                  <span style={{
                    color: TREND_COLOR[a.trend],
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}>{TREND_ICON[a.trend]} {a.trend}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pwin Calibration */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Pwin Model Calibration</h4>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Pwin Range</th>
              <th style={{ textAlign: "right", padding: 8 }}>Predicted</th>
              <th style={{ textAlign: "right", padding: 8 }}>Actual</th>
              <th style={{ textAlign: "right", padding: 8 }}>Count</th>
              <th style={{ textAlign: "left", padding: 8 }}>Calibration</th>
            </tr>
          </thead>
          <tbody>
            {data.pwin_calibration.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{c.range}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{pct(c.predicted_win_rate)}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{pct(c.actual_win_rate)}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{c.count}</td>
                <td style={{ padding: 8 }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    background: c.calibration === "accurate" ? "#dcfce7" : c.calibration === "overconfident" ? "#fee2e2" : "#fef3c7",
                    color: c.calibration === "accurate" ? "#16a34a" : c.calibration === "overconfident" ? "#dc2626" : "#d97706",
                  }}>{c.calibration}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quarterly Trends */}
      <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Quarterly Win/Loss Trends</h4>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Quarter</th>
              <th style={{ textAlign: "right", padding: 8 }}>Wins</th>
              <th style={{ textAlign: "right", padding: 8 }}>Losses</th>
              <th style={{ textAlign: "right", padding: 8 }}>Win Rate</th>
              <th style={{ textAlign: "right", padding: 8 }}>Avg Value</th>
              <th style={{ textAlign: "right", padding: 8 }}>Pipeline</th>
            </tr>
          </thead>
          <tbody>
            {data.quarterly_trends.map((q, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{q.quarter}</td>
                <td style={{ padding: 8, textAlign: "right", color: "#16a34a" }}>{q.wins}</td>
                <td style={{ padding: 8, textAlign: "right", color: "#dc2626" }}>{q.losses}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: q.win_rate >= 0.40 ? "#16a34a" : q.win_rate >= 0.30 ? "#d97706" : "#dc2626" }}>
                  {pct(q.win_rate)}
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>{fmt$(q.avg_contract_value)}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{fmt$(q.total_pipeline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Main Page
// ───────────────────────────────────────────────────────────

export default function Predictive() {
  const [tab, setTab] = useState<Tab>("pwin");
  const [loading, setLoading] = useState(true);

  // Pwin models
  const [pwinModels, setPwinModels] = useState<PwinModelData[]>([]);
  const [selectedPwinId, setSelectedPwinId] = useState<string | null>(null);

  // Forecast
  const [forecastData, setForecastData] = useState<PipelineForecastData | null>(null);

  // Bid/No-Bid
  const [bidData, setBidData] = useState<BidAssessmentsListData | null>(null);
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);

  // Win/Loss
  const [winLossData, setWinLossData] = useState<WinLossAnalysisData | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchPwinModels(),
      fetchPipelineForecast(),
      fetchBidAssessments(),
      fetchWinLossAnalysis(),
    ])
      .then(([pwinEnv, forecastEnv, bidEnv, wlEnv]) => {
        if (pwinEnv.success && pwinEnv.data) setPwinModels(pwinEnv.data.models ?? []);
        if (forecastEnv.success && forecastEnv.data) setForecastData(forecastEnv.data);
        if (bidEnv.success && bidEnv.data) setBidData(bidEnv.data);
        if (wlEnv.success && wlEnv.data) setWinLossData(wlEnv.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "pwin", label: `ML Pwin (${pwinModels.length})` },
    { key: "forecast", label: "Revenue Forecast" },
    { key: "bid", label: `Bid/No-Bid (${bidData?.total ?? 0})` },
    { key: "patterns", label: "Win/Loss Patterns" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 700 }}>Predictive Analytics</h1>

      {/* Summary strip */}
      {winLossData && forecastData && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
          marginBottom: 20,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: 16,
        }}>
          {[
            { label: "Opps Tracked", value: String(pwinModels.length) },
            { label: "Portfolio Win Rate", value: pct(winLossData.summary.overall_win_rate), color: "#16a34a" },
            { label: "Weighted Pipeline", value: fmt$(forecastData.summary.weighted_pipeline), color: "#7c3aed" },
            { label: "P50 Revenue", value: fmt$(forecastData.summary.p50_revenue) },
            { label: "Target Gap", value: fmt$(forecastData.summary.gap_to_target), color: "#dc2626" },
            { label: "Bid Recommended", value: String(bidData?.bid ?? 0), color: "#16a34a" },
            { label: "Model Accuracy", value: pct(winLossData.summary.avg_pwin_accuracy), color: "#7c3aed" },
          ].map((kpi, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid var(--color-border)", marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 18px",
              border: "none",
              background: tab === t.key ? "var(--color-surface)" : "transparent",
              color: tab === t.key ? "var(--color-text)" : "var(--color-text-muted)",
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
              borderBottom: tab === t.key ? "2px solid #7c3aed" : "2px solid transparent",
              marginBottom: -2,
              borderRadius: "6px 6px 0 0",
            }}
          >{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading predictive analytics...</div>}

      {!loading && tab === "pwin" && (
        <PwinModelsTab models={pwinModels} selectedId={selectedPwinId} onSelect={setSelectedPwinId} />
      )}
      {!loading && tab === "forecast" && forecastData && (
        <ForecastTab data={forecastData} />
      )}
      {!loading && tab === "bid" && bidData && (
        <BidNoBidTab data={bidData} selectedId={selectedBidId} onSelect={setSelectedBidId} />
      )}
      {!loading && tab === "patterns" && winLossData && (
        <WinLossTab data={winLossData} />
      )}
    </div>
  );
}
