import { useEffect, useState, useRef, useCallback } from "react";
import {
  fetchColorReviews,
  runColorReviewWithFile,
  runColorReviewWithText,
  type ColorReviewData,
  type ColorReviewRow,
  type ColorReviewRunResult,
  type ColorReviewRequirementCheckRow,
  type ColorReviewSectionScoreRow,
  type ColorReviewGoldCheckRow,
  type ColorReviewCostLineItemRow,
  type ColorReviewGreenCheckRow,
  type ColorReviewFormatCheckRow,
} from "../api/client";

const PHASE_COLORS: Record<string, string> = {
  white: "#94a3b8",
  pink: "#ec4899",
  green: "#22c55e",
  red: "#ef4444",
  gold: "#eab308",
};

const PHASE_LABELS: Record<string, string> = {
  white: "White Team",
  pink: "Pink Team",
  green: "Green Team",
  red: "Red Team",
  gold: "Gold Team",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280",
  in_progress: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
};

const VERDICT_COLORS: Record<string, string> = {
  pass: "#22c55e",
  fail: "#ef4444",
  warning: "#f59e0b",
  not_reviewed: "#6b7280",
};

const VERDICT_LABELS: Record<string, string> = {
  pass: "PASS",
  fail: "FAIL",
  warning: "WARN",
  not_reviewed: "N/R",
};

const GO_COLORS: Record<string, string> = {
  go: "#22c55e",
  conditional_go: "#f59e0b",
  no_go: "#ef4444",
};

const GO_LABELS: Record<string, string> = {
  go: "GO",
  conditional_go: "CONDITIONAL GO",
  no_go: "NO-GO",
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type DetailTab = "checks" | "sections" | "gold" | "costs" | "green" | "format" | "risks";

export default function ColorReview() {
  const [data, setData] = useState<ColorReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("checks");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expandedGold, setExpandedGold] = useState<string | null>(null);
  const [runModal, setRunModal] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewComplete, setReviewComplete] = useState<ColorReviewRunResult | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchColorReviews()
      .then((env) => {
        if (env.success && env.data) {
          setData(env.data);
          if (env.data.reviews.length > 0) setSelected(env.data.reviews[0].id);
        } else {
          setError(env.error?.message ?? "Failed to load color reviews");
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading color reviews...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;
  if (!data) return null;

  const source = data.source;

  let reviews = data.reviews;
  if (phaseFilter) reviews = reviews.filter((r) => r.phase === phaseFilter);
  if (statusFilter) reviews = reviews.filter((r) => r.status === statusFilter);

  const sel = data.reviews.find((r) => r.id === selected) ?? null;

  // Determine best tab for selected review
  function bestTab(r: ColorReviewRow): DetailTab {
    if (r.phase === "pink" && (r.requirement_checks ?? []).length > 0) return "checks";
    if (r.phase === "red" && (r.section_scores ?? []).length > 0) return "sections";
    if (r.phase === "gold" && (r.gold_checks ?? []).length > 0) return "gold";
    if (r.phase === "green" && (r.cost_line_items ?? []).length > 0) return "costs";
    if (r.phase === "green" && (r.green_checks ?? []).length > 0) return "green";
    if (r.phase === "white" && (r.format_checks ?? []).length > 0) return "format";
    if ((r.risk_factors ?? []).length > 0) return "risks";
    return "checks";
  }

  function handleSelect(id: string) {
    setSelected(id);
    setExpandedCheck(null);
    setExpandedSection(null);
    setExpandedGold(null);
    const r = data!.reviews.find((rv) => rv.id === id);
    if (r) setTab(bestTab(r));
  }

  async function handleUploadReview(file: File | null, pastedText: string, phase: string, title: string, agency: string) {
    setReviewing(true);
    setRunResult(null);
    setReviewComplete(null);
    try {
      let env;
      if (file) {
        env = await runColorReviewWithFile(file, phase, title || undefined, agency || undefined);
      } else if (pastedText.trim()) {
        env = await runColorReviewWithText(pastedText, phase, title || undefined, agency || undefined);
      } else {
        setRunResult("Please upload a file or paste document text.");
        setReviewing(false);
        return;
      }
      if (env.success && env.data) {
        if (env.data.status === "completed") {
          setReviewComplete(env.data);
          setRunResult(null);
          // Refresh review list
          const refreshed = await fetchColorReviews();
          if (refreshed.success && refreshed.data) {
            setData(refreshed.data);
            if (env.data.reviewId) setSelected(env.data.reviewId);
          }
        } else {
          setRunResult(env.data.message ?? "Review queued — connect OpenAI API key for AI reviews.");
        }
      } else {
        setRunResult(env.error?.message ?? "Review failed");
      }
    } catch (e) {
      setRunResult(`Error: ${String(e)}`);
    } finally {
      setReviewing(false);
    }
  }

  const { summary } = data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Color Review</h1>
        <span style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          background: source === "n8n" ? "#166534" : "#1e3a5f",
          color: source === "n8n" ? "#4ade80" : "#60a5fa",
        }}>{source === "n8n" ? "Live n8n" : "Mock data"}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setRunModal(true); setRunResult(null); }}
          style={{
            background: "#7c3aed",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >Upload & Review Document</button>
      </div>

      {/* Summary strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(9, 1fr)",
        gap: 12,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
      }}>
        {[
          { label: "Reviews", value: String(data.total) },
          { label: "White", value: String(summary.phaseCounts["white"] ?? 0), color: PHASE_COLORS.white },
          { label: "Pink", value: String(summary.phaseCounts["pink"] ?? 0), color: PHASE_COLORS.pink },
          { label: "Green", value: String(summary.phaseCounts["green"] ?? 0), color: PHASE_COLORS.green },
          { label: "Red", value: String(summary.phaseCounts["red"] ?? 0), color: PHASE_COLORS.red },
          { label: "Gold", value: String(summary.phaseCounts["gold"] ?? 0), color: PHASE_COLORS.gold },
          { label: "Avg Score", value: `${summary.avgScore}%`, color: summary.avgScore >= 80 ? "#22c55e" : summary.avgScore >= 60 ? "#f59e0b" : "#ef4444" },
          { label: "Proposals", value: String(summary.proposalsReviewed) },
          { label: "GO / Cond / No-Go", value: `${summary.goCount} / ${summary.conditionalGoCount} / ${summary.noGoCount}`, color: "#7c3aed" },
        ].map((kpi, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} style={selectStyle}>
          <option value="">All Phases</option>
          <option value="white">White Team</option>
          <option value="pink">Pink Team</option>
          <option value="green">Green Team</option>
          <option value="red">Red Team</option>
          <option value="gold">Gold Team</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In Progress</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        {(phaseFilter || statusFilter) && (
          <button onClick={() => { setPhaseFilter(""); setStatusFilter(""); }} style={{ background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-text-muted)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>
            Clear filters
          </button>
        )}
        <span style={{ color: "var(--color-text-muted)", fontSize: 12, alignSelf: "center" }}>
          {reviews.length} of {data.total}
        </span>
      </div>

      {/* Split view */}
      <div style={{ display: "flex", gap: 16, minHeight: 600 }}>
        {/* Left list */}
        <div style={{
          width: 420,
          minWidth: 420,
          maxHeight: 700,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {reviews.map((r) => (
            <div
              key={r.id}
              onClick={() => handleSelect(r.id)}
              style={{
                padding: "12px 14px",
                borderRadius: 6,
                cursor: "pointer",
                border: selected === r.id ? "1px solid #7c3aed" : "1px solid var(--color-border)",
                background: selected === r.id ? "rgba(124,58,237,0.08)" : "var(--color-surface)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.proposal_title.length > 50 ? r.proposal_title.slice(0, 50) + "..." : r.proposal_title}
                </span>
                {r.status === "completed" && <span style={{ fontSize: 16, fontWeight: 700, color: r.overall_score >= 80 ? "#22c55e" : r.overall_score >= 60 ? "#f59e0b" : "#ef4444" }}>{r.overall_score}%</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                <span style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: PHASE_COLORS[r.phase] ?? "#6b7280",
                  color: "#fff",
                  fontWeight: 600,
                }}>{PHASE_LABELS[r.phase] ?? r.phase}</span>
                <span style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.06)",
                  color: STATUS_COLORS[r.status] ?? "#6b7280",
                  border: `1px solid ${STATUS_COLORS[r.status] ?? "#6b7280"}`,
                }}>{STATUS_LABELS[r.status] ?? r.status}</span>
                {r.go_no_go && (
                  <span style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: GO_COLORS[r.go_no_go] ?? "#6b7280",
                    color: "#fff",
                    fontWeight: 700,
                  }}>{GO_LABELS[r.go_no_go]}</span>
                )}
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>{r.agency}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right detail */}
        <div style={{
          flex: 1,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: 20,
          overflowY: "auto",
          maxHeight: 700,
        }}>
          {!sel ? (
            <p style={{ color: "var(--color-text-muted)" }}>Select a review to view details</p>
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{sel.proposal_title}</h2>
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: PHASE_COLORS[sel.phase],
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                  }}>{PHASE_LABELS[sel.phase]}</span>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${STATUS_COLORS[sel.status]}`,
                    color: STATUS_COLORS[sel.status],
                    fontSize: 12,
                  }}>{STATUS_LABELS[sel.status]}</span>
                  {sel.go_no_go && (
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: 4,
                      background: GO_COLORS[sel.go_no_go],
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                    }}>{GO_LABELS[sel.go_no_go]}</span>
                  )}
                  {sel.confidence !== null && (
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      Confidence: {sel.confidence}%
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: "auto" }}>
                    {formatDate(sel.started_at)}
                    {sel.completed_at ? ` — ${formatDate(sel.completed_at)}` : ""}
                  </span>
                </div>
              </div>

              {/* Score bar */}
              {sel.status === "completed" && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: (sel.phase === "pink" || sel.phase === "white") ? "repeat(4, 1fr)" : sel.phase === "green" ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
                  gap: 12,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                  border: "1px solid var(--color-border)",
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Overall Score</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: sel.overall_score >= 80 ? "#22c55e" : sel.overall_score >= 60 ? "#f59e0b" : "#ef4444" }}>{sel.overall_score}%</div>
                  </div>
                  {(sel.phase === "pink" || sel.phase === "white") && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Pass Rate</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: sel.pass_rate >= 90 ? "#22c55e" : sel.pass_rate >= 75 ? "#f59e0b" : "#ef4444" }}>{sel.pass_rate}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Checks</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          <span style={{ color: "#22c55e" }}>{sel.passed_checks}P</span>{" / "}
                          <span style={{ color: "#ef4444" }}>{sel.failed_checks}F</span>{" / "}
                          <span style={{ color: "#f59e0b" }}>{sel.warning_checks}W</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Total</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{sel.total_checks}</div>
                      </div>
                    </>
                  )}
                  {sel.phase === "green" && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Cost Items</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{(sel.cost_line_items ?? []).length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Checks</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          <span style={{ color: "#22c55e" }}>{sel.passed_checks}P</span>{" / "}
                          <span style={{ color: "#ef4444" }}>{sel.failed_checks}F</span>{" / "}
                          <span style={{ color: "#f59e0b" }}>{sel.warning_checks}W</span>
                        </div>
                      </div>
                    </>
                  )}
                  {(sel.phase !== "pink" && sel.phase !== "white" && sel.phase !== "green") && (
                    <div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Reviewer</div>
                      <div style={{ fontSize: 13 }}>{sel.reviewer}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              <div style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--color-text-muted)",
                marginBottom: 16,
                padding: 12,
                background: "rgba(124,58,237,0.05)",
                borderRadius: 6,
                borderLeft: `3px solid ${PHASE_COLORS[sel.phase]}`,
              }}>
                {sel.summary}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
                {([
                  { key: "checks" as DetailTab, label: `Compliance (${(sel.requirement_checks ?? []).length})`, show: (sel.requirement_checks ?? []).length > 0 },
                  { key: "sections" as DetailTab, label: `Sections (${(sel.section_scores ?? []).length})`, show: (sel.section_scores ?? []).length > 0 },
                  { key: "gold" as DetailTab, label: `Gold Checks (${(sel.gold_checks ?? []).length})`, show: (sel.gold_checks ?? []).length > 0 },
                  { key: "costs" as DetailTab, label: `Cost Items (${(sel.cost_line_items ?? []).length})`, show: (sel.cost_line_items ?? []).length > 0 },
                  { key: "green" as DetailTab, label: `Green Checks (${(sel.green_checks ?? []).length})`, show: (sel.green_checks ?? []).length > 0 },
                  { key: "format" as DetailTab, label: `Format Checks (${(sel.format_checks ?? []).length})`, show: (sel.format_checks ?? []).length > 0 },
                  { key: "risks" as DetailTab, label: `Risk Factors (${(sel.risk_factors ?? []).length})`, show: (sel.risk_factors ?? []).length > 0 },
                ] as const).filter((t) => t.show).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      background: tab === t.key ? "rgba(124,58,237,0.15)" : "transparent",
                      color: tab === t.key ? "#a78bfa" : "var(--color-text-muted)",
                      border: "none",
                      borderRadius: 4,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontWeight: tab === t.key ? 700 : 400,
                      fontSize: 13,
                    }}
                  >{t.label}</button>
                ))}
              </div>

              {/* Tab content */}
              {tab === "checks" && <ComplianceChecks checks={sel.requirement_checks ?? []} expanded={expandedCheck} onToggle={(id) => setExpandedCheck(expandedCheck === id ? null : id)} />}
              {tab === "sections" && <SectionScores sections={sel.section_scores ?? []} expanded={expandedSection} onToggle={(id) => setExpandedSection(expandedSection === id ? null : id)} />}
              {tab === "gold" && <GoldChecks checks={sel.gold_checks ?? []} expanded={expandedGold} onToggle={(id) => setExpandedGold(expandedGold === id ? null : id)} />}
              {tab === "costs" && <CostLineItems items={sel.cost_line_items ?? []} />}
              {tab === "green" && <GreenChecks checks={sel.green_checks ?? []} />}
              {tab === "format" && <FormatChecks checks={sel.format_checks ?? []} />}
              {tab === "risks" && <RiskFactors factors={sel.risk_factors ?? []} />}
            </>
          )}
        </div>
      </div>

      {/* Upload & Review modal */}
      {runModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }} onClick={() => { if (!reviewing) setRunModal(false); }}>
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: 24,
            width: 560,
            maxHeight: "85vh",
            overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>Upload & Review Document</h3>
            {reviewComplete ? (
              <ReviewResultView result={reviewComplete} onClose={() => { setRunModal(false); setReviewComplete(null); }} />
            ) : (
              <UploadReviewForm
                onSubmit={handleUploadReview}
                result={runResult}
                reviewing={reviewing}
              />
            )}
            {!reviewing && !reviewComplete && (
              <button onClick={() => setRunModal(false)} style={{ marginTop: 12, background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-text-muted)", borderRadius: 4, padding: "6px 16px", cursor: "pointer" }}>Cancel</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ComplianceChecks({ checks, expanded, onToggle }: { checks: ColorReviewRequirementCheckRow[]; expanded: string | null; onToggle: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {checks.map((c) => (
        <div key={c.id} style={{
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          background: "rgba(255,255,255,0.02)",
          overflow: "hidden",
        }}>
          <div
            onClick={() => onToggle(c.id)}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 3,
              background: VERDICT_COLORS[c.verdict],
              color: "#fff",
              fontWeight: 700,
              minWidth: 36,
              textAlign: "center",
            }}>{VERDICT_LABELS[c.verdict]}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{c.requirement_text.length > 100 ? c.requirement_text.slice(0, 100) + "..." : c.requirement_text}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{c.source_reference}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{expanded === c.id ? "▲" : "▼"}</span>
          </div>
          {expanded === c.id && (
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)" }}>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>Requirement ID</div>
                <div style={{ fontSize: 13 }}>{c.requirement_id}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>Full Requirement</div>
                <div style={{ fontSize: 13 }}>{c.requirement_text}</div>
              </div>
              {c.response_location && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>Response Location</div>
                  <div style={{ fontSize: 13, color: "#22c55e" }}>{c.response_location}</div>
                </div>
              )}
              {c.gap_detail && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>Gap Detail</div>
                  <div style={{ fontSize: 13, color: "#ef4444" }}>{c.gap_detail}</div>
                </div>
              )}
              {c.suggestion && (
                <div style={{ marginTop: 8, padding: 10, background: "rgba(59,130,246,0.08)", borderRadius: 4, borderLeft: "3px solid #3b82f6" }}>
                  <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4, fontWeight: 600 }}>Suggestion</div>
                  <div style={{ fontSize: 13 }}>{c.suggestion}</div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionScores({ sections, expanded, onToggle }: { sections: ColorReviewSectionScoreRow[]; expanded: string | null; onToggle: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sections.map((s) => {
        const pct = Math.round((s.score / s.max_score) * 100);
        const barColor = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
        return (
          <div key={s.id} style={{
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.02)",
            overflow: "hidden",
          }}>
            <div
              onClick={() => onToggle(s.id)}
              style={{ padding: "12px 14px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.section}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 8 }}>{s.volume}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: barColor }}>{s.score}/{s.max_score}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{expanded === s.id ? "▲" : "▼"}</span>
                </div>
              </div>
              <div style={{ marginTop: 6, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
            </div>
            {expanded === s.id && (
              <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, marginBottom: 4 }}>Strengths ({(s.strengths ?? []).length})</div>
                    {(s.strengths ?? []).map((st, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid #22c55e" }}>{st}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>Weaknesses ({(s.weaknesses ?? []).length})</div>
                    {(s.weaknesses ?? []).map((w, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid #ef4444" }}>{w}</div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, marginBottom: 4 }}>Discriminators Found ({(s.discriminators_found ?? []).length})</div>
                    {(s.discriminators_found ?? []).map((d, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid #3b82f6" }}>{d}</div>
                    ))}
                    {(s.discriminators_found ?? []).length === 0 && <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>None identified</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>Discriminators Missing ({(s.discriminators_missing ?? []).length})</div>
                    {(s.discriminators_missing ?? []).map((d, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid #f59e0b" }}>{d}</div>
                    ))}
                    {(s.discriminators_missing ?? []).length === 0 && <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>None</div>}
                  </div>
                </div>
                {(s.improvement_actions ?? []).length > 0 && (
                  <div style={{ marginTop: 12, padding: 10, background: "rgba(59,130,246,0.08)", borderRadius: 4, borderLeft: "3px solid #3b82f6" }}>
                    <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, marginBottom: 4 }}>Improvement Actions ({(s.improvement_actions ?? []).length})</div>
                    {(s.improvement_actions ?? []).map((a, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>• {a}</div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                  {s.evaluator_notes}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GoldChecks({ checks, expanded, onToggle }: { checks: ColorReviewGoldCheckRow[]; expanded: string | null; onToggle: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {checks.map((c) => {
        const pct = Math.round((c.score / c.max_score) * 100);
        const barColor = VERDICT_COLORS[c.verdict] ?? "#6b7280";
        return (
          <div key={c.id} style={{
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.02)",
            overflow: "hidden",
          }}>
            <div
              onClick={() => onToggle(c.id)}
              style={{ padding: "12px 14px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: VERDICT_COLORS[c.verdict],
                    color: "#fff",
                    fontWeight: 700,
                  }}>{VERDICT_LABELS[c.verdict]}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: barColor }}>{c.score}/{c.max_score}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{expanded === c.id ? "▲" : "▼"}</span>
                </div>
              </div>
              <div style={{ marginTop: 6, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
            </div>
            {expanded === c.id && (
              <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)" }}>
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>{c.detail}</div>
                {(c.recommendations ?? []).length > 0 && (
                  <div style={{ marginTop: 10, padding: 10, background: "rgba(59,130,246,0.08)", borderRadius: 4, borderLeft: "3px solid #3b82f6" }}>
                    <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, marginBottom: 4 }}>Recommendations ({(c.recommendations ?? []).length})</div>
                    {(c.recommendations ?? []).map((r, i) => (
                      <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>• {r}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmt$(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : abs >= 1e3 ? `$${(abs / 1e3).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}

function CostLineItems({ items }: { items: ColorReviewCostLineItemRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.5fr", gap: 8, padding: "8px 14px", fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, borderBottom: "1px solid var(--color-border)" }}>
        <span>Category</span><span style={{ textAlign: "right" }}>Proposed</span><span style={{ textAlign: "right" }}>Gov. Estimate</span><span style={{ textAlign: "right" }}>Variance</span><span style={{ textAlign: "center" }}>Status</span>
      </div>
      {items.map((c) => (
        <div key={c.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, background: "rgba(255,255,255,0.02)", padding: "12px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.5fr", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{c.category}</span>
            <span style={{ textAlign: "right", fontSize: 14, fontWeight: 700 }}>{fmt$(c.proposed_amount)}</span>
            <span style={{ textAlign: "right", fontSize: 13, color: "var(--color-text-muted)" }}>{c.government_estimate !== null ? fmt$(c.government_estimate) : "—"}</span>
            <span style={{ textAlign: "right", fontSize: 13, color: c.variance_pct !== null ? (Math.abs(c.variance_pct) <= 5 ? "#22c55e" : c.variance_pct > 10 ? "#ef4444" : "#f59e0b") : "var(--color-text-muted)" }}>
              {c.variance_pct !== null ? `${c.variance_pct > 0 ? "+" : ""}${c.variance_pct.toFixed(1)}%` : "—"}
            </span>
            <span style={{ textAlign: "center" }}>
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: VERDICT_COLORS[c.verdict], color: "#fff", fontWeight: 700 }}>{VERDICT_LABELS[c.verdict]}</span>
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
            <strong>BOE:</strong> {c.basis_of_estimate}
          </div>
          {c.notes && <div style={{ marginTop: 4, fontSize: 12, color: c.verdict === "fail" ? "#ef4444" : c.verdict === "warning" ? "#f59e0b" : "var(--color-text-muted)" }}>{c.notes}</div>}
        </div>
      ))}
      {/* Total row */}
      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.5fr", gap: 8, padding: "10px 14px", borderTop: "2px solid var(--color-border)", fontWeight: 700, fontSize: 14 }}>
          <span>Total</span>
          <span style={{ textAlign: "right" }}>{fmt$(items.reduce((s, c) => s + c.proposed_amount, 0))}</span>
          <span style={{ textAlign: "right", color: "var(--color-text-muted)" }}>{fmt$(items.filter((c) => c.government_estimate !== null).reduce((s, c) => s + (c.government_estimate ?? 0), 0))}</span>
          <span /><span />
        </div>
      )}
    </div>
  );
}

function GreenChecks({ checks }: { checks: ColorReviewGreenCheckRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {checks.map((c) => (
        <div key={c.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, background: "rgba(255,255,255,0.02)", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: VERDICT_COLORS[c.verdict], color: "#fff", fontWeight: 700, minWidth: 36, textAlign: "center" }}>{VERDICT_LABELS[c.verdict]}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</span>
            {c.benchmark && <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>Benchmark: {c.benchmark}</span>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-text-muted)" }}>{c.detail}</div>
          {c.recommendation && (
            <div style={{ marginTop: 8, padding: 10, background: "rgba(59,130,246,0.08)", borderRadius: 4, borderLeft: "3px solid #3b82f6" }}>
              <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, marginBottom: 4 }}>Recommendation</div>
              <div style={{ fontSize: 12 }}>{c.recommendation}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FormatChecks({ checks }: { checks: ColorReviewFormatCheckRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {checks.map((c) => (
        <div key={c.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, background: "rgba(255,255,255,0.02)", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: VERDICT_COLORS[c.verdict], color: "#fff", fontWeight: 700, minWidth: 36, textAlign: "center" }}>{VERDICT_LABELS[c.verdict]}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</span>
            <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "rgba(148,163,184,0.15)", color: "#94a3b8" }}>{c.volume}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>Expected</div>
              <div style={{ fontSize: 13 }}>{c.expected}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>Actual</div>
              <div style={{ fontSize: 13, color: c.verdict === "pass" ? "#22c55e" : c.verdict === "fail" ? "#ef4444" : "#f59e0b" }}>{c.actual}</div>
            </div>
          </div>
          {c.detail && <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>{c.detail}</div>}
        </div>
      ))}
    </div>
  );
}

function RiskFactors({ factors }: { factors: string[] }) {
  const severityColor = (f: string): string => {
    if (f.startsWith("CRITICAL:")) return "#ef4444";
    if (f.startsWith("HIGH:")) return "#f59e0b";
    if (f.startsWith("MEDIUM:")) return "#3b82f6";
    if (f.startsWith("LOW:")) return "#6b7280";
    return "#f59e0b";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {factors.map((f, i) => (
        <div key={i} style={{
          padding: "10px 14px",
          borderRadius: 6,
          borderLeft: `3px solid ${severityColor(f)}`,
          background: "rgba(255,255,255,0.02)",
          fontSize: 13,
        }}>
          {f}
        </div>
      ))}
    </div>
  );
}

function UploadReviewForm({ onSubmit, result, reviewing }: {
  onSubmit: (file: File | null, pastedText: string, phase: string, title: string, agency: string) => void;
  result: string | null;
  reviewing: boolean;
}) {
  const [phase, setPhase] = useState("pink");
  const [title, setTitle] = useState("");
  const [agency, setAgency] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setInputMode("file"); }
  }, []);

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 0, marginBottom: 16 }}>
        Upload your proposal document and select a review type. The AI will evaluate it against Shipley criteria and provide detailed findings.
      </p>

      {/* Review Phase */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4, fontWeight: 600 }}>Review Phase</label>
        <select value={phase} onChange={(e) => setPhase(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
          <option value="white">White Team — Format & Compliance</option>
          <option value="pink">Pink Team — Compliance Check</option>
          <option value="red">Red Team — Quality Scoring</option>
          <option value="green">Green Team — Cost/Pricing Review</option>
          <option value="gold">Gold Team — Executive Go/No-Go</option>
        </select>
      </div>

      {/* Title and Agency */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4, fontWeight: 600 }}>Document Title (optional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Technical Volume I" style={{ ...selectStyle, width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4, fontWeight: 600 }}>Agency (optional)</label>
          <input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="e.g. USACE" style={{ ...selectStyle, width: "100%" }} />
        </div>
      </div>

      {/* Input mode tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setInputMode("file")} style={{ background: inputMode === "file" ? "rgba(124,58,237,0.15)" : "transparent", color: inputMode === "file" ? "#a78bfa" : "var(--color-text-muted)", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: inputMode === "file" ? 700 : 400 }}>Upload File</button>
        <button onClick={() => setInputMode("paste")} style={{ background: inputMode === "paste" ? "rgba(124,58,237,0.15)" : "transparent", color: inputMode === "paste" ? "#a78bfa" : "var(--color-text-muted)", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: inputMode === "paste" ? 700 : 400 }}>Paste Text</button>
      </div>

      {/* File upload */}
      {inputMode === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#7c3aed" : "var(--color-border)"}`,
            borderRadius: 8,
            padding: 24,
            textAlign: "center",
            cursor: "pointer",
            marginBottom: 14,
            background: dragOver ? "rgba(124,58,237,0.05)" : "transparent",
            transition: "all 0.2s",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx"
            onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
            style={{ display: "none" }}
          />
          {file ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>{file.name}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB — Click to change</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                Drag & drop your proposal document here
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                PDF, TXT, DOCX — up to 50 MB
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paste text */}
      {inputMode === "paste" && (
        <div style={{ marginBottom: 14 }}>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste your proposal document text here..."
            style={{
              ...selectStyle,
              width: "100%",
              minHeight: 120,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          {pastedText && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
              {pastedText.length.toLocaleString()} characters
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={() => onSubmit(inputMode === "file" ? file : null, inputMode === "paste" ? pastedText : "", phase, title, agency)}
        disabled={reviewing || (inputMode === "file" && !file) || (inputMode === "paste" && !pastedText.trim())}
        style={{
          background: reviewing ? "#4b5563" : "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "10px 24px",
          cursor: reviewing ? "wait" : "pointer",
          fontWeight: 600,
          fontSize: 14,
          opacity: (reviewing || (inputMode === "file" && !file) || (inputMode === "paste" && !pastedText.trim())) ? 0.6 : 1,
        }}
      >
        {reviewing ? "Analyzing document..." : `Run ${phase.charAt(0).toUpperCase() + phase.slice(1)} Team Review`}
      </button>

      {reviewing && (
        <div style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 6,
          background: "rgba(124,58,237,0.08)",
          border: "1px solid rgba(124,58,237,0.2)",
          fontSize: 13,
          color: "#a78bfa",
        }}>
          AI is reviewing your document... This may take 15-30 seconds depending on document length.
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 4,
          background: result.startsWith("Error") ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
          color: result.startsWith("Error") ? "#ef4444" : "#f59e0b",
          fontSize: 13,
        }}>{result}</div>
      )}
    </div>
  );
}

function ReviewResultView({ result, onClose }: { result: ColorReviewRunResult; onClose: () => void }) {
  const goColor = result.go_no_go === "go" ? "#22c55e" : result.go_no_go === "no_go" ? "#ef4444" : "#f59e0b";
  const goLabel = result.go_no_go === "go" ? "GO" : result.go_no_go === "no_go" ? "NO-GO" : "CONDITIONAL";
  const phaseLabel = PHASE_LABELS[result.phase] ?? result.phase;

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ display: "inline-block", padding: "6px 20px", borderRadius: 20, background: goColor, color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: 2 }}>{goLabel}</div>
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-muted)" }}>{phaseLabel} Review Complete</div>
      </div>

      {/* Score cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <div style={{ background: "rgba(124,58,237,0.08)", borderRadius: 6, padding: 10, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa" }}>{result.overall_score ?? 0}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Score</div>
        </div>
        <div style={{ background: "rgba(34,197,94,0.08)", borderRadius: 6, padding: 10, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{result.passed_checks ?? 0}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Passed</div>
        </div>
        <div style={{ background: "rgba(239,68,68,0.08)", borderRadius: 6, padding: 10, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{result.failed_checks ?? 0}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Failed</div>
        </div>
        <div style={{ background: "rgba(245,158,11,0.08)", borderRadius: 6, padding: 10, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{result.warning_checks ?? 0}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Warnings</div>
        </div>
      </div>

      {/* Summary */}
      {result.summary && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)", fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11, color: "var(--color-text-muted)" }}>Executive Summary</div>
          {result.summary}
        </div>
      )}

      {/* Risk factors */}
      {result.risk_factors && result.risk_factors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, color: "var(--color-text-muted)" }}>Risk Factors</div>
          {result.risk_factors.map((f, i) => (
            <div key={i} style={{
              padding: "8px 12px",
              borderRadius: 4,
              borderLeft: `3px solid ${f.startsWith("CRITICAL") ? "#ef4444" : f.startsWith("HIGH") ? "#f59e0b" : "#3b82f6"}`,
              background: "rgba(255,255,255,0.02)",
              fontSize: 12,
              marginBottom: 4,
            }}>{f}</div>
          ))}
        </div>
      )}

      {result.ai && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 12 }}>
          Reviewed by {result.ai.model} — {result.ai.tokens.toLocaleString()} tokens used
        </div>
      )}

      <div style={{ textAlign: "center" }}>
        <button onClick={onClose} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontWeight: 600 }}>
          View Full Review Details
        </button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 13,
};
