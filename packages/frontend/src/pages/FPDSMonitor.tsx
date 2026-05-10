import { useState, useEffect } from "react";
import {
  fetchFPDSSummary,
  fetchFPDSAwards,
  type FPDSSummaryData,
  type FPDSAwardRow,
} from "../api/client";

const AWARD_TYPE_LABELS: Record<string, string> = {
  definitive_contract: "Definitive Contract",
  purchase_order: "Purchase Order",
  bpa_call: "BPA Call",
  delivery_order: "Delivery Order",
  idiq: "IDIQ",
};

const COMPETITION_LABELS: Record<string, string> = {
  full_and_open: "Full & Open",
  set_aside: "Set-Aside",
  sole_source: "Sole Source",
  follow_on: "Follow-On",
  other: "Other",
};

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}40`, textTransform: "uppercase", letterSpacing: "0.5px",
    }}>{label}</span>
  );
}

function SummaryBox({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      padding: "12px 16px", background: "var(--color-surface)", borderRadius: 10,
      border: "1px solid var(--color-border)", textAlign: "center", minWidth: 100,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

export default function FPDSMonitor() {
  const [summary, setSummary] = useState<FPDSSummaryData | null>(null);
  const [awards, setAwards] = useState<FPDSAwardRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [competitorFilter, setCompetitorFilter] = useState<boolean | null>(null);
  const [recompeteFilter, setRecompeteFilter] = useState<boolean | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchFPDSSummary().then((r) => { if (r.data) setSummary(r.data); }),
      fetchFPDSAwards().then((r) => { if (r.data) setAwards(r.data); }),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = awards.filter((a) => {
    if (competitorFilter !== null && a.is_competitor !== competitorFilter) return false;
    if (recompeteFilter !== null && a.is_recompete_candidate !== recompeteFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.vendor.toLowerCase().includes(q) || a.agency.toLowerCase().includes(q) || a.piid.toLowerCase().includes(q);
    }
    return true;
  });

  const sel = filtered.find((a) => a.id === selectedId) ?? null;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading FPDS Monitor...</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>FPDS Award Monitor</h2>

      {/* Summary Strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryBox label="Awards" value={summary.total_awards} />
          <SummaryBox label="Total Value" value={fmt$(summary.total_value)} color="#16a34a" />
          <SummaryBox label="Competitor Wins" value={summary.competitor_awards} color="#dc2626"
            onClick={() => setCompetitorFilter(competitorFilter === true ? null : true)} />
          <SummaryBox label="Competitors" value={summary.unique_competitors} color="#ea580c" />
          <SummaryBox label="Recompete" value={summary.recompete_candidates} color="#3b82f6"
            onClick={() => setRecompeteFilter(recompeteFilter === true ? null : true)} />
          <SummaryBox label="Avg Relevance" value={`${summary.avg_relevance}%`} color="#8b5cf6" />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Search awards..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 13, width: 260,
          }}
        />
        {competitorFilter !== null && (
          <button onClick={() => setCompetitorFilter(null)} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 12, cursor: "pointer",
          }}>Clear: Competitor</button>
        )}
        {recompeteFilter !== null && (
          <button onClick={() => setRecompeteFilter(null)} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 12, cursor: "pointer",
          }}>Clear: Recompete</button>
        )}
      </div>

      {/* Content */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* List */}
        <div style={{ width: 420, flexShrink: 0, maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
          {filtered.map((a) => (
            <div key={a.id} onClick={() => setSelectedId(a.id)} style={{
              padding: 14, background: selectedId === a.id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderLeft: `4px solid ${a.is_competitor ? "#dc2626" : a.is_recompete_candidate ? "#3b82f6" : "#16a34a"}`,
              borderRadius: 8, marginBottom: 8, cursor: "pointer", transition: "background 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{a.piid}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {a.is_competitor && <Pill label="Competitor" color="#dc2626" />}
                  {a.is_recompete_candidate && <Pill label="Recompete" color="#3b82f6" />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: a.relevance_score >= 85 ? "#16a34a" : a.relevance_score >= 70 ? "#d97706" : "#6b7280" }}>
                    {a.relevance_score}%
                  </span>
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{a.title}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{a.vendor}</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{fmt$(a.award_amount)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!sel ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select an award to view details</div>
          ) : (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{sel.title}</h3>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sel.is_competitor && <Pill label={`Competitor: ${sel.competitor_name}`} color="#dc2626" />}
                    {sel.is_recompete_candidate && <Pill label="Recompete Candidate" color="#3b82f6" />}
                    <Pill label={AWARD_TYPE_LABELS[sel.award_type] ?? sel.award_type} color="#6366f1" />
                    <Pill label={COMPETITION_LABELS[sel.competition_type] ?? sel.competition_type} color="#0ea5e9" />
                  </div>
                </div>
                <a href={sel.fpds_url} target="_blank" rel="noopener noreferrer" style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #3b82f6",
                  background: "#3b82f618", color: "#3b82f6", textDecoration: "none", fontWeight: 600, fontSize: 12,
                }}>View on FPDS</a>
              </div>

              {/* Metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                <MetricBox label="Award Amount" value={fmt$(sel.award_amount)} color="#16a34a" />
                <MetricBox label="Ceiling" value={sel.ceiling_amount ? fmt$(sel.ceiling_amount) : "N/A"} />
                <MetricBox label="Relevance" value={`${sel.relevance_score}%`} color={sel.relevance_score >= 85 ? "#16a34a" : "#d97706"} />
                <MetricBox label="Award Date" value={new Date(sel.award_date).toLocaleDateString()} />
              </div>

              {/* Details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <DetailRow label="Vendor" value={sel.vendor} />
                <DetailRow label="Agency" value={sel.agency} />
                <DetailRow label="PIID" value={sel.piid} />
                <DetailRow label="NAICS" value={sel.naics} />
                <DetailRow label="PSC" value={sel.psc ?? "—"} />
                <DetailRow label="Place of Performance" value={sel.place_of_performance ?? "—"} />
                <DetailRow label="PoP Start" value={new Date(sel.period_of_performance_start).toLocaleDateString()} />
                <DetailRow label="PoP End" value={new Date(sel.period_of_performance_end).toLocaleDateString()} />
                {sel.vendor_duns && <DetailRow label="DUNS" value={sel.vendor_duns} />}
                {sel.recompete_date && <DetailRow label="Recompete Date" value={new Date(sel.recompete_date).toLocaleDateString()} />}
              </div>

              {/* Competitor Alert */}
              {sel.is_competitor && sel.competitor_name && (
                <div style={{
                  padding: 12, background: "#dc262610", borderRadius: 8, border: "1px solid #dc262630", marginBottom: 16,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#dc2626", marginBottom: 4 }}>Competitor Win Alert</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    <strong>{sel.competitor_name}</strong> was awarded this contract ({fmt$(sel.award_amount)}). This should be reflected in competitive intelligence tracking and may impact
                    {sel.is_recompete_candidate ? ` recompete planning (target date: ${sel.recompete_date ? new Date(sel.recompete_date).toLocaleDateString() : "TBD"}).` : " market positioning analysis."}
                  </div>
                </div>
              )}

              {/* Recompete Alert */}
              {sel.is_recompete_candidate && !sel.is_competitor && (
                <div style={{
                  padding: 12, background: "#3b82f610", borderRadius: 8, border: "1px solid #3b82f630",
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#3b82f6", marginBottom: 4 }}>Recompete Opportunity</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    This contract is a recompete candidate. Estimated recompete date: {sel.recompete_date ? new Date(sel.recompete_date).toLocaleDateString() : "TBD"}.
                    Consider adding to capture pipeline for early positioning.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 8, background: "var(--color-bg)", borderRadius: 6, border: "1px solid var(--color-border)" }}>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}
