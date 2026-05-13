import { useState, useEffect } from "react";
import {
  fetchSAMSummary,
  fetchSAMOpportunities,
  fetchSAMScans,
  triggerSAMScan,
  qualifySAMOpportunity,
  triggerOpportunityWatch,
  type SAMSummaryData,
  type SAMOpportunityRow,
  type SAMScanRow,
} from "../api/client";

type Tab = "opportunities" | "scans";

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  tracked: "#d97706",
  qualified: "#16a34a",
  dismissed: "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  presolicitation: "Pre-Solicitation",
  solicitation: "Solicitation",
  award: "Award",
  sources_sought: "Sources Sought",
  special_notice: "Special Notice",
  combined_synopsis: "Combined Synopsis",
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
      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}40`, textTransform: "uppercase", letterSpacing: "0.5px",
    }}>{label}</span>
  );
}

function SummaryBox({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px", background: "var(--color-surface)", borderRadius: 10,
        border: "1px solid var(--color-border)", textAlign: "center", minWidth: 100,
        cursor: onClick ? "pointer" : "default", transition: "background 0.15s",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

export default function SAMMonitor() {
  const [tab, setTab] = useState<Tab>("opportunities");
  const [summary, setSummary] = useState<SAMSummaryData | null>(null);
  const [opps, setOpps] = useState<SAMOpportunityRow[]>([]);
  const [scans, setScans] = useState<SAMScanRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState(false);

  const handleAIScore = async () => {
    setScoring(true);
    setScoreMsg(null);
    setScoreError(false);
    try {
      const result = await triggerOpportunityWatch();
      if (result.data) {
        const s = result.data.summary;
        setScoreMsg(`Scored ${s.total_scored} opportunities: ${s.pursue} pursue, ${s.evaluate} evaluate, ${s.pass} pass`);
        fetchSAMOpportunities().then((r) => { if (r.data) setOpps(r.data); });
        fetchSAMSummary().then((r) => { if (r.data) setSummary(r.data); });
      } else {
        setScoreError(true);
        setScoreMsg(result.error?.message ?? "Scoring failed");
      }
    } catch (e) {
      setScoreError(true);
      setScoreMsg(e instanceof Error ? e.message : String(e));
    }
    setScoring(false);
  };

  useEffect(() => {
    Promise.all([
      fetchSAMSummary().then((r) => { if (r.data) setSummary(r.data); }),
      fetchSAMOpportunities().then((r) => { if (r.data) setOpps(r.data); }),
      fetchSAMScans().then((r) => { if (r.data) setScans(r.data); }),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = opps.filter((o) => {
    if (statusFilter && o.scan_status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return o.title.toLowerCase().includes(q) || o.agency.toLowerCase().includes(q) || o.naics.includes(q);
    }
    return true;
  });

  const sel = filtered.find((o) => o.id === selectedId) ?? null;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading SAM.gov Monitor...</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>SAM.gov Monitor</h2>

      {/* Summary Strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryBox label="Total" value={summary.total} />
          <SummaryBox label="New" value={summary.new_count} color="#3b82f6" onClick={() => setStatusFilter(statusFilter === "new" ? null : "new")} />
          <SummaryBox label="Tracked" value={summary.tracked_count} color="#d97706" onClick={() => setStatusFilter(statusFilter === "tracked" ? null : "tracked")} />
          <SummaryBox label="Qualified" value={summary.qualified_count} color="#16a34a" onClick={() => setStatusFilter(statusFilter === "qualified" ? null : "qualified")} />
          <SummaryBox label="Dismissed" value={summary.dismissed_count} color="#6b7280" onClick={() => setStatusFilter(statusFilter === "dismissed" ? null : "dismissed")} />
          <SummaryBox label="Avg Relevance" value={`${summary.avg_relevance}%`} color="#8b5cf6" />
          <SummaryBox label="NAICS Match" value={summary.naics_matched} color="#0ea5e9" />
          <SummaryBox label="Last Scan" value={summary.last_scan ? relTime(summary.last_scan) : "Never"} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--color-border)" }}>
        {(["opportunities", "scans"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", background: "transparent", border: "none", borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
            color: tab === t ? "#3b82f6" : "var(--color-text-muted)", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            {t === "opportunities" ? `Opportunities (${filtered.length})` : `Scan History (${scans.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      {tab === "opportunities" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <input
            placeholder="Search opportunities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
              color: "var(--color-text)", fontSize: 13, width: 260,
            }}
          />
          {statusFilter && (
            <button onClick={() => setStatusFilter(null)} style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
              color: "var(--color-text)", fontSize: 12, cursor: "pointer",
            }}>
              Clear filter: {statusFilter}
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {scoreMsg && (
              <span style={{ fontSize: 11, color: scoreError ? "#ef4444" : "#16a34a" }}>
                {scoreMsg}
              </span>
            )}
            <button
              onClick={handleAIScore}
              disabled={scoring}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "1px solid #8b5cf6",
                background: scoring ? "#8b5cf630" : "#8b5cf618", color: "#8b5cf6",
                fontWeight: 600, fontSize: 12, cursor: scoring ? "wait" : "pointer", opacity: scoring ? 0.7 : 1,
              }}
            >
              {scoring ? "Scoring..." : "AI Score All"}
            </button>
            <button
              onClick={() => triggerSAMScan()}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "1px solid #3b82f6",
                background: "#3b82f618", color: "#3b82f6", fontWeight: 600, fontSize: 12, cursor: "pointer",
              }}
            >
              Trigger Scan
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {tab === "opportunities" && (
        <div style={{ display: "flex", gap: 20 }}>
          {/* List */}
          <div style={{ width: 420, flexShrink: 0, maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
            {filtered.map((o) => (
              <div key={o.id} onClick={() => setSelectedId(o.id)} style={{
                padding: 14, background: selectedId === o.id ? "var(--color-surface-hover)" : "var(--color-surface)",
                border: "1px solid var(--color-border)", borderLeft: `4px solid ${STATUS_COLORS[o.scan_status] ?? "#6b7280"}`,
                borderRadius: 8, marginBottom: 8, cursor: "pointer", transition: "background 0.15s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{o.notice_id}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Pill label={o.scan_status} color={STATUS_COLORS[o.scan_status] ?? "#6b7280"} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: o.relevance_score >= 85 ? "#16a34a" : o.relevance_score >= 70 ? "#d97706" : "#6b7280" }}>
                      {o.relevance_score}%
                    </span>
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{o.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{o.agency}</span>
                  {o.value_estimate && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text)" }}>{fmt$(o.value_estimate)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Detail */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!sel ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select an opportunity to view details</div>
            ) : (
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{sel.title}</h3>
                    <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Pill label={sel.scan_status} color={STATUS_COLORS[sel.scan_status] ?? "#6b7280"} />
                      <Pill label={TYPE_LABELS[sel.type] ?? sel.type} color="#6366f1" />
                      {sel.set_aside && <Pill label={sel.set_aside} color="#0ea5e9" />}
                      {sel.matched_naics && <Pill label="NAICS Match" color="#16a34a" />}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {sel.scan_status !== "qualified" && (
                      <button onClick={() => qualifySAMOpportunity(sel.id)} style={{
                        padding: "6px 14px", borderRadius: 6, border: "1px solid #16a34a",
                        background: "#16a34a18", color: "#16a34a", cursor: "pointer", fontWeight: 600, fontSize: 12,
                      }}>Qualify</button>
                    )}
                    <a href={sel.sam_url} target="_blank" rel="noopener noreferrer" style={{
                      padding: "6px 14px", borderRadius: 6, border: "1px solid #3b82f6",
                      background: "#3b82f618", color: "#3b82f6", textDecoration: "none", fontWeight: 600, fontSize: 12,
                    }}>View on SAM.gov</a>
                  </div>
                </div>

                {/* Metadata grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                  <MetricBox label="Relevance" value={`${sel.relevance_score}%`} color={sel.relevance_score >= 85 ? "#16a34a" : "#d97706"} />
                  <MetricBox label="Value" value={sel.value_estimate ? fmt$(sel.value_estimate) : "TBD"} />
                  <MetricBox label="NAICS" value={sel.naics} />
                  <MetricBox label="Deadline" value={sel.response_deadline ? new Date(sel.response_deadline).toLocaleDateString() : "Open"} />
                </div>

                {/* AI Summary */}
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>AI Summary</h4>
                  <div style={{ padding: 12, background: "#3b82f610", borderRadius: 8, border: "1px solid #3b82f630", fontSize: 13, lineHeight: 1.6 }}>
                    {sel.ai_summary}
                  </div>
                </div>

                {/* Details */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <DetailRow label="Agency" value={sel.agency} />
                  <DetailRow label="Sub-Agency" value={sel.sub_agency ?? "—"} />
                  <DetailRow label="NAICS" value={`${sel.naics} — ${sel.naics_description}`} />
                  <DetailRow label="PSC" value={sel.psc ?? "—"} />
                  <DetailRow label="Place of Performance" value={sel.place_of_performance ?? "—"} />
                  <DetailRow label="Posted" value={new Date(sel.posted_date).toLocaleDateString()} />
                </div>

                {/* Relevance Reasons */}
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Relevance Reasons</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sel.relevance_reasons.map((r, i) => (
                      <div key={i} style={{ padding: "6px 10px", background: "#16a34a10", borderRadius: 6, border: "1px solid #16a34a30", fontSize: 12 }}>
                        {r}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Matched Keywords */}
                {sel.matched_keywords.length > 0 && (
                  <div>
                    <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Matched Keywords</h4>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {sel.matched_keywords.map((kw) => (
                        <Pill key={kw} label={kw} color="#8b5cf6" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "scans" && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Scan ID", "Started", "Duration", "Status", "Found", "New Matches", "NAICS Scanned"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => {
                const dur = s.completed_at ? `${Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)}s` : "—";
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>{s.id}</td>
                    <td style={{ padding: "10px 14px" }}>{relTime(s.started_at)}</td>
                    <td style={{ padding: "10px 14px" }}>{dur}</td>
                    <td style={{ padding: "10px 14px" }}><Pill label={s.status} color={s.status === "completed" ? "#16a34a" : s.status === "failed" ? "#dc2626" : "#d97706"} /></td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{s.opportunities_found}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: s.new_matches > 0 ? "#3b82f6" : "var(--color-text)" }}>{s.new_matches}</td>
                    <td style={{ padding: "10px 14px" }}>{s.naics_codes_scanned.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
