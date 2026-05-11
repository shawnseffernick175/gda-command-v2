import { useState, useEffect } from "react";
import ExportButton from "../components/ExportButton";
import {
  fetchCPARSSummary,
  fetchCPARSRecords,
  generateCPARSNarrative,
  type CPARSSummaryData,
  type CPARSRecordRow,
} from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  draft: "#d97706",
  in_review: "#3b82f6",
  submitted: "#8b5cf6",
  finalized: "#16a34a",
};

const RATING_COLORS: Record<string, string> = {
  Exceptional: "#16a34a",
  "Very Good": "#0ea5e9",
  Satisfactory: "#d97706",
  Marginal: "#ea580c",
  Unsatisfactory: "#dc2626",
};

function fmt$(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs}`;
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

export default function CPARSBuilder() {
  const [summary, setSummary] = useState<CPARSSummaryData | null>(null);
  const [records, setRecords] = useState<CPARSRecordRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNarrative, setShowNarrative] = useState<"human" | "ai">("human");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCPARSSummary().then((r) => { if (r.data) setSummary(r.data); }),
      fetchCPARSRecords().then((r) => { if (r.data) setRecords(r.data); }),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = records.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return r.contract_title.toLowerCase().includes(q) || r.agency.toLowerCase().includes(q) || r.contract_number.toLowerCase().includes(q);
    }
    return true;
  });

  const sel = filtered.find((r) => r.id === selectedId) ?? null;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading CPARS Builder...</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>CPARS / Past Performance Builder</h2>
        <ExportButton endpoint="cpars" label="Export CSV" />
      </div>

      {/* Summary Strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryBox label="Records" value={summary.total} />
          <SummaryBox label="Finalized" value={summary.finalized} color="#16a34a" onClick={() => setStatusFilter(statusFilter === "finalized" ? null : "finalized")} />
          <SummaryBox label="In Review" value={summary.in_review} color="#3b82f6" onClick={() => setStatusFilter(statusFilter === "in_review" ? null : "in_review")} />
          <SummaryBox label="Draft" value={summary.draft} color="#d97706" onClick={() => setStatusFilter(statusFilter === "draft" ? null : "draft")} />
          <SummaryBox label="Submitted" value={summary.submitted} color="#8b5cf6" onClick={() => setStatusFilter(statusFilter === "submitted" ? null : "submitted")} />
          <SummaryBox label="Total Value" value={fmt$(summary.total_value)} />
          <SummaryBox label="Exceptional" value={summary.exceptional} color="#16a34a" />
          <SummaryBox label="AI Generated" value={summary.ai_generated} color="#6366f1" />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Search records..."
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
            Clear: {statusFilter}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* List */}
        <div style={{ width: 420, flexShrink: 0, maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
          {filtered.map((r) => (
            <div key={r.id} onClick={() => { setSelectedId(r.id); setShowNarrative("human"); }} style={{
              padding: 14, background: selectedId === r.id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)", borderLeft: `4px solid ${STATUS_COLORS[r.status] ?? "#6b7280"}`,
              borderRadius: 8, marginBottom: 8, cursor: "pointer", transition: "background 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{r.contract_number}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <Pill label={r.status} color={STATUS_COLORS[r.status] ?? "#6b7280"} />
                  {r.overall_rating && <Pill label={r.overall_rating} color={RATING_COLORS[r.overall_rating] ?? "#6b7280"} />}
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.contract_title}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{r.agency}</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{fmt$(r.contract_value)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!sel ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select a record to view details</div>
          ) : (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{sel.contract_title}</h3>
                  <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
                    <Pill label={sel.status} color={STATUS_COLORS[sel.status] ?? "#6b7280"} />
                    {sel.overall_rating && <Pill label={sel.overall_rating} color={RATING_COLORS[sel.overall_rating] ?? "#6b7280"} />}
                    {sel.ai_generated_narrative && <Pill label="AI Narrative" color="#6366f1" />}
                  </div>
                </div>
                <button onClick={() => generateCPARSNarrative(sel.id)} style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #6366f1",
                  background: "#6366f118", color: "#6366f1", cursor: "pointer", fontWeight: 600, fontSize: 12,
                }}>Generate AI Narrative</button>
              </div>

              {/* Ratings grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Quality", rating: sel.quality_rating },
                  { label: "Schedule", rating: sel.schedule_rating },
                  { label: "Cost", rating: sel.cost_rating },
                  { label: "Management", rating: sel.management_rating },
                  { label: "Overall", rating: sel.overall_rating },
                ].map(({ label, rating }) => (
                  <div key={label} style={{
                    padding: 10, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: rating ? (RATING_COLORS[rating] ?? "var(--color-text)") : "var(--color-text-muted)" }}>
                      {rating ?? "Pending"}
                    </div>
                  </div>
                ))}
              </div>

              {/* Contract Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                <DetailRow label="Contract Number" value={sel.contract_number} />
                <DetailRow label="Agency" value={sel.agency} />
                <DetailRow label="Value" value={fmt$(sel.contract_value)} />
                <DetailRow label="Period of Performance" value={sel.period_of_performance} />
                <DetailRow label="Evaluator" value={sel.evaluator ?? "Pending"} />
                <DetailRow label="Evaluation Date" value={sel.evaluation_date ?? "Pending"} />
              </div>

              {/* Narrative Toggle */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
                  <button onClick={() => setShowNarrative("human")} style={{
                    padding: "6px 16px", border: "1px solid var(--color-border)", borderRadius: "6px 0 0 6px",
                    background: showNarrative === "human" ? "#3b82f618" : "transparent",
                    color: showNarrative === "human" ? "#3b82f6" : "var(--color-text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}>Human Narrative</button>
                  <button onClick={() => setShowNarrative("ai")} style={{
                    padding: "6px 16px", border: "1px solid var(--color-border)", borderLeft: "none", borderRadius: "0 6px 6px 0",
                    background: showNarrative === "ai" ? "#6366f118" : "transparent",
                    color: showNarrative === "ai" ? "#6366f1" : "var(--color-text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}>AI-Generated Narrative</button>
                </div>
                <div style={{
                  padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.7,
                  background: showNarrative === "ai" ? "#6366f108" : "var(--color-bg)",
                  border: `1px solid ${showNarrative === "ai" ? "#6366f130" : "var(--color-border)"}`,
                }}>
                  {showNarrative === "human"
                    ? (sel.narrative || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No human narrative yet. Click "Generate AI Narrative" to create a draft.</span>)
                    : (sel.ai_generated_narrative || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No AI narrative generated yet. Click "Generate AI Narrative" to create one.</span>)
                  }
                </div>
              </div>

              {/* Key Accomplishments */}
              {sel.key_accomplishments.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Key Accomplishments</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sel.key_accomplishments.map((a, i) => (
                      <div key={i} style={{
                        padding: "6px 10px", background: "#16a34a10", borderRadius: 6, border: "1px solid #16a34a30", fontSize: 12,
                        display: "flex", gap: 8,
                      }}>
                        <span style={{ color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Relevance Tags & Matched Opportunities */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Relevance Tags</h4>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {sel.relevance_tags.map((tag) => <Pill key={tag} label={tag} color="#8b5cf6" />)}
                  </div>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Matched Opportunities</h4>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {sel.matched_opportunities.map((opp) => <Pill key={opp} label={opp} color="#3b82f6" />)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
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
