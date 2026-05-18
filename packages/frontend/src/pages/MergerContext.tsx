import { useEffect, useState, useCallback } from "react";
import {
  fetchMergers,
  fetchMergerDetail,
  type MergerEntry,
  type MergerImpactEntry,
} from "../api/client";

function formatCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "$0";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const IMPACT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#94a3b8",
  monitor: "#f59e0b",
};

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  announced: { bg: "#1e3a5f", text: "#60a5fa" },
  pending: { bg: "#3b2f1e", text: "#fbbf24" },
  completed: { bg: "#1e3b2f", text: "#4ade80" },
  blocked: { bg: "#3b1e1e", text: "#f87171" },
  withdrawn: { bg: "#2d2d2d", text: "#94a3b8" },
};

const DEAL_TYPE_LABELS: Record<string, string> = {
  acquisition: "Acquisition",
  merger: "Merger",
  divestiture: "Divestiture",
  joint_venture: "Joint Venture",
  strategic_alliance: "Strategic Alliance",
};

const IMPACT_TYPE_LABELS: Record<string, string> = {
  competitor_strengthened: "Competitor Strengthened",
  competitor_weakened: "Competitor Weakened",
  new_teaming: "New Teaming Opportunity",
  lost_teaming: "Lost Teaming Partner",
  incumbent_change: "Incumbent Change",
  neutral: "Neutral",
};

export default function MergerContext() {
  const [mergers, setMergers] = useState<MergerEntry[]>([]);
  const [impactSummary, setImpactSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMerger, setSelectedMerger] = useState<string | null>(null);
  const [mergerDetail, setMergerDetail] = useState<MergerEntry | null>(null);
  const [impacts, setImpacts] = useState<MergerImpactEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchMergers();
      if (env.success && env.data) {
        setMergers(env.data.mergers);
        setImpactSummary(env.data.impact_summary);
      } else {
        setError(env.error?.message ?? "Failed to load M&A events");
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelectMerger = async (id: string) => {
    setSelectedMerger(id);
    setDetailLoading(true);
    try {
      const env = await fetchMergerDetail(id);
      if (env.success && env.data) {
        setMergerDetail(env.data.merger);
        setImpacts(env.data.impacts);
      }
    } catch {
      setMergerDetail(null);
      setImpacts([]);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
        Loading M&A intelligence...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ color: "#ef4444", marginBottom: 16 }}>Error: {error}</div>
        <button onClick={load} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
          Merger & Acquisition Context
        </h1>
        <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 14 }}>
          {mergers.length} tracked events affecting the competitive landscape
        </p>
      </div>

      {/* Impact KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <KPICard label="Total Events" value={mergers.length} color="#3b82f6" />
        <KPICard label="Negative Impact" value={impactSummary.negative ?? 0} color="#ef4444" />
        <KPICard label="Monitor" value={impactSummary.monitor ?? 0} color="#f59e0b" />
        <KPICard label="Positive" value={impactSummary.positive ?? 0} color="#22c55e" />
      </div>

      {/* M&A Timeline Table */}
      <div style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", overflow: "hidden", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b" }}>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Acquirer</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Target</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Type</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Status</th>
              <th style={{ textAlign: "right", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Deal Value</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Our Impact</th>
              <th style={{ textAlign: "right", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Score Adj</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {mergers.map((m) => {
              const statusBadge = STATUS_BADGES[m.status] ?? STATUS_BADGES.announced;
              return (
                <tr
                  key={m.id}
                  onClick={() => handleSelectMerger(m.id)}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    cursor: "pointer",
                    background: selectedMerger === m.id ? "#1e293b" : "transparent",
                  }}
                >
                  <td style={{ padding: "10px 16px", color: "#e2e8f0", fontWeight: 600 }}>{m.acquirer_name}</td>
                  <td style={{ padding: "10px 16px", color: "#e2e8f0" }}>{m.target_name}</td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>
                    {DEAL_TYPE_LABELS[m.deal_type] ?? m.deal_type}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{
                      background: statusBadge.bg,
                      color: statusBadge.text,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {m.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#94a3b8" }}>
                    {m.deal_value ? formatCurrency(m.deal_value) : "—"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{
                      color: IMPACT_COLORS[m.our_impact] ?? "#94a3b8",
                      fontWeight: 600,
                      fontSize: 12,
                      textTransform: "uppercase",
                    }}>
                      {m.our_impact}
                    </span>
                  </td>
                  <td style={{
                    padding: "10px 16px",
                    textAlign: "right",
                    color: m.score_adjustment > 0 ? "#22c55e" : m.score_adjustment < 0 ? "#ef4444" : "#94a3b8",
                    fontWeight: 600,
                  }}>
                    {m.score_adjustment > 0 ? `+${m.score_adjustment}` : m.score_adjustment}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>
                    {m.announced_date ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      {selectedMerger && (
        <div style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", margin: 0 }}>
              {mergerDetail ? `${mergerDetail.acquirer_name} → ${mergerDetail.target_name}` : "Loading..."}
            </h2>
            <button
              onClick={() => setSelectedMerger(null)}
              style={{ padding: "4px 12px", background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              Close
            </button>
          </div>

          {detailLoading ? (
            <div style={{ color: "#64748b", padding: 16, textAlign: "center" }}>Loading details...</div>
          ) : mergerDetail ? (
            <div>
              {/* Deal Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Rationale</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>{mergerDetail.rationale ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Impact Summary</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>{mergerDetail.impact_summary ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Affected Agencies</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>
                    {mergerDetail.affected_agencies?.length > 0 ? mergerDetail.affected_agencies.join(", ") : "—"}
                  </div>
                </div>
              </div>

              {/* Opportunity Impacts */}
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>
                  Linked Opportunity Impacts ({impacts.length})
                </h3>
                {impacts.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 13, padding: 8 }}>
                    No opportunities linked to this M&A event yet.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#1e293b" }}>
                        <th style={{ textAlign: "left", padding: "6px 12px", color: "#64748b" }}>Opportunity</th>
                        <th style={{ textAlign: "left", padding: "6px 12px", color: "#64748b" }}>Agency</th>
                        <th style={{ textAlign: "left", padding: "6px 12px", color: "#64748b" }}>Impact Type</th>
                        <th style={{ textAlign: "right", padding: "6px 12px", color: "#64748b" }}>Score Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impacts.map((imp) => (
                        <tr key={imp.id} style={{ borderBottom: "1px solid #1e293b" }}>
                          <td style={{ padding: "6px 12px", color: "#e2e8f0" }}>{imp.opp_title ?? imp.opportunity_id}</td>
                          <td style={{ padding: "6px 12px", color: "#94a3b8" }}>{imp.opp_agency ?? "—"}</td>
                          <td style={{ padding: "6px 12px", color: "#94a3b8" }}>
                            {IMPACT_TYPE_LABELS[imp.impact_type] ?? imp.impact_type}
                          </td>
                          <td style={{
                            padding: "6px 12px",
                            textAlign: "right",
                            color: imp.score_delta > 0 ? "#22c55e" : imp.score_delta < 0 ? "#ef4444" : "#94a3b8",
                            fontWeight: 600,
                          }}>
                            {imp.score_delta > 0 ? `+${imp.score_delta}` : imp.score_delta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
