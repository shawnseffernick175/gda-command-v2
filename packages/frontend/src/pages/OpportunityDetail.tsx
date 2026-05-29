import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import AskAIChat from "../components/AskAIChat";
import SourceBadge from "../components/SourceBadge";
import VersionHistory from "../components/VersionHistory";
import { authenticatedFetch } from "../api/auth";
import {
  fetchOpportunityDetail,
  fetchPwinBreakdown,
  fetchIncumbentAnalysis,
  fetchCompetitorField,
  fetchBlackHatAnalysis,
  fetchWargameAnalysis,
  fetchOpportunityTimeline,
  changeOpportunityStage,
  SHIPLEY_STAGES,
  type OpportunityDetailData,
  type OodaObserveItem,
  type OodaOrientItem,
  type OodaDecideOption,
  type OodaActStep,
  type OpportunitySourceRow,
  type PwinBreakdownData,
  type IncumbentData,
  type CompetitorFieldData,
  type BlackHatAnalysisData,
  type WargameAnalysisData,
  type TimelineEvent,
} from "../api/client";

// ---------------------------------------------------------------------------
// Capture Coach types
// ---------------------------------------------------------------------------

interface CaptureCoachFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  detail: string;
}

interface CaptureCoachGap {
  gap: string;
  severity: "critical" | "high" | "medium" | "low";
  mitigation: string;
}

interface CaptureCoachRisk {
  risk: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

interface CaptureCoachAction {
  action: string;
  priority: "critical" | "high" | "medium" | "low";
  owner: string;
  timeline: string;
}

interface CaptureCoachTeaming {
  partner_type: string;
  rationale: string;
}

interface CaptureCoachAnalysis {
  opportunity_id: string;
  win_probability: {
    score: number;
    confidence: "high" | "medium" | "low";
    factors: CaptureCoachFactor[];
  };
  capture_strategy: {
    approach: string;
    discriminators: string[];
    win_themes: string[];
    teaming_recommendations: CaptureCoachTeaming[];
  };
  gap_analysis: CaptureCoachGap[];
  risk_assessment: CaptureCoachRisk[];
  next_actions: CaptureCoachAction[];
  executive_summary: string;
  model_used: string;
  generated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  discovery: "#6b7280",
  qualified: "#01696F",
  pipeline: "#22c55e",
  lost: "#ef4444",
  won: "#eab308",
  no_bid: "#9ca3af",
};

const STATUS_TO_SHIPLEY: Record<string, string> = {
  discovery: "interest",
  qualified: "qualify",
  pipeline: "pursue",
  won: "won",
  lost: "lost",
  no_bid: "no_bid",
};

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function priorityColor(p: string): string {
  if (p === "high") return "#ef4444";
  if (p === "medium") return "#f59e0b";
  return "#6b7280";
}

function orientTypeColor(t: string): string {
  if (t === "strength") return "#22c55e";
  if (t === "risk") return "#ef4444";
  if (t === "inference") return "#a78bfa";
  return "#6b7280";
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<OpportunityDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pwin, setPwin] = useState<PwinBreakdownData | null>(null);
  const [incumbent, setIncumbent] = useState<IncumbentData | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorFieldData | null>(null);
  const [blackHat, setBlackHat] = useState<BlackHatAnalysisData | null>(null);
  const [wargame, setWargame] = useState<WargameAnalysisData | null>(null);

  // Activity timeline state
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  // Capture Coach state
  const [coachAnalysis, setCoachAnalysis] = useState<CaptureCoachAnalysis | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResult, setCoachResult] = useState<{ message: string; isError: boolean } | null>(null);

  // AI Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{ message: string; isError: boolean } | null>(null);

  const [activeTab, setActiveTab] = useState("overview");

  // Entity eligibility state (W4)
  const [entityResults, setEntityResults] = useState<Array<{
    entity_id: string; legal_name: string; eligible: boolean;
    checks: Array<{ check: string; pass: boolean; detail: string }>;
    score: number; total_checks: number;
  }> | null>(null);
  const [recommendedEntity, setRecommendedEntity] = useState<string | null>(null);
  const [pursuingEntity, setPursuingEntity] = useState<string | null>(null);
  const [entitySaving, setEntitySaving] = useState(false);

  const backPath = location.state?.from ?? "/ops-tracker";
  const backLabel = backPath === "/pipeline" ? "Pipeline" : backPath === "/" ? "Launchpad" : "Ops Tracker";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchOpportunityDetail(id)
      .then((env) => {
        if (!env.success || !env.data) {
          setError(env.error?.message ?? "Unknown error");
        } else {
          setData(env.data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Reset enrichment state before fetching for new opportunity
    setPwin(null);
    setIncumbent(null);
    setCompetitors(null);
    setBlackHat(null);
    setWargame(null);
    setCoachAnalysis(null);
    setCoachResult(null);
    setTimeline([]);

    // Fetch enrichments in parallel (non-blocking) — validate data shape before setting state
    fetchPwinBreakdown(id).then((e) => { if (e.success && e.data && typeof e.data.overall_pwin === "number" && Array.isArray(e.data.factors)) setPwin(e.data); }).catch(() => {});
    fetchIncumbentAnalysis(id).then((e) => { if (e.success && e.data && typeof e.data.incumbent_name === "string") setIncumbent(e.data); }).catch(() => {});
    fetchCompetitorField(id).then((e) => { if (e.success && e.data && Array.isArray(e.data.competitors)) setCompetitors(e.data); }).catch(() => {});
    fetchBlackHatAnalysis(id).then((e) => { if (e.success && e.data && Array.isArray(e.data.scenarios)) setBlackHat(e.data); }).catch(() => {});
    fetchWargameAnalysis(id).then((e) => { if (e.success && e.data && Array.isArray(e.data.scenarios)) setWargame(e.data); }).catch(() => {});
    fetchOpportunityTimeline(id).then((e) => { if (e.success && e.data && Array.isArray(e.data.events)) setTimeline(e.data.events); }).catch(() => {});
    // Fetch entity eligibility (W4)
    authenticatedFetch(`/api/admin/companies/check-all/${id}`)
      .then((r) => r.json())
      .then((env: { success: boolean; data: { results: typeof entityResults extends infer T ? T : never; recommended_entity: string | null } | null }) => {
        if (env.success && env.data) {
          setEntityResults(env.data.results as typeof entityResults);
          setRecommendedEntity(env.data.recommended_entity);
        }
      })
      .catch(() => {});
    // Fetch cached Capture Coach analysis
    authenticatedFetch(`/api/agents/capture-coach/analysis/${id}`)
      .then((r) => r.json())
      .then((env: { success: boolean; data: { analysis: CaptureCoachAnalysis | null } | null }) => {
        if (env.success && env.data?.analysis) setCoachAnalysis(env.data.analysis);
      })
      .catch(() => {});
  }, [id]);

  // Sync pursuing entity from loaded data (W4)
  useEffect(() => {
    if (data?.opportunity?.pursuing_entity_id) {
      setPursuingEntity(data.opportunity.pursuing_entity_id);
    } else {
      setPursuingEntity(null);
    }
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={styles.skeleton} />
        <div style={{ ...styles.skeleton, width: "60%", marginTop: 12 }} />
        <div style={{ ...styles.skeleton, height: 200, marginTop: 24 }} />
        <div style={{ ...styles.skeleton, height: 150, marginTop: 16 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "2rem" }}>
        <button onClick={() => navigate(backPath)} style={styles.backBtn}>
          ← {backLabel}
        </button>
        <div style={styles.errorBox}>
          <strong>Error loading opportunity detail</strong>
          <p>{error ?? "No data returned."}</p>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            workflow: gda-opportunity-detail · action: read
          </p>
        </div>
      </div>
    );
  }

  const { opportunity: opp, analysis: rawAnalysis, ooda: rawOoda, sources, learning } = data;
  const analysis = rawAnalysis ?? { executive_summary: null, recommended_action: null, strengths: [], risks: [], competitive_landscape: null };


  const emptyOodaPhase = { summary: null, items: [] };
  const ooda = {
    observe: rawOoda?.observe ?? emptyOodaPhase,
    orient: rawOoda?.orient ?? { summary: null, items: [] },
    decide: rawOoda?.decide ?? { summary: null, options: [] },
    act: rawOoda?.act ?? { summary: null, next_steps: [] },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naicsMatch = (rawOoda as any)?.naics_match as { level: string; score: number; companyCode: string | null; oppCode: string; explanation: string; canBidAsPrime: boolean } | null;

  const handleRunAnalysis = async () => {
    if (!id) return;
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await authenticatedFetch(`/api/opportunities/${id}/analyze`, {
        method: "POST",
      });
      const env = await res.json();
      if (env.success) {
        setAnalyzeResult({ message: "AI analysis complete — refreshing...", isError: false });
        // Re-fetch the detail data to show updated OODA/Pwin
        const detail = await fetchOpportunityDetail(id);
        if (detail.success && detail.data) setData(detail.data);
      } else {
        setAnalyzeResult({ message: env.error?.message ?? "Analysis failed", isError: true });
      }
    } catch (err) {
      setAnalyzeResult({ message: (err as Error).message, isError: true });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCaptureCoach = async () => {
    if (!id) return;
    setCoachLoading(true);
    setCoachResult(null);
    try {
      const res = await authenticatedFetch("/api/agents/capture-coach/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: id }),
      });
      const env = await res.json();
      if (env.success && env.data?.analysis) {
        setCoachAnalysis(env.data.analysis);
        const wp = env.data.analysis.win_probability;
        setCoachResult({
          message: `Strategy generated — Win probability: ${wp.score}% (${wp.confidence} confidence) | ${env.data.analysis.next_actions?.length ?? 0} actions, ${env.data.analysis.gap_analysis?.length ?? 0} gaps, ${env.data.analysis.risk_assessment?.length ?? 0} risks`,
          isError: false,
        });
      } else {
        setCoachResult({ message: env.error?.message ?? "Failed to generate strategy", isError: true });
      }
    } catch (err) {
      setCoachResult({ message: (err as Error).message, isError: true });
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1100 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 8, fontSize: 13, color: "#9ca3af" }}>
        <span
          style={{ cursor: "pointer", color: "#60a5fa" }}
          onClick={() => navigate(backPath)}
        >
          {backLabel}
        </span>
        {" > "}
        <span>{opp.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>{opp.title} <SourceBadge source={opp.data_source} size="md" /></h1>
        <select
          value={opp.capture_stage ?? STATUS_TO_SHIPLEY[opp.status] ?? "interest"}
          onChange={async (e) => {
            const newStage = e.target.value;
            try {
              const env = await changeOpportunityStage(opp.id, newStage);
              if (env.success) {
                const detail = await fetchOpportunityDetail(opp.id);
                if (detail.success && detail.data) setData(detail.data);
              }
            } catch { /* empty */ }
          }}
          style={{
            padding: "4px 8px",
            borderRadius: 8,
            border: "none",
            background: STATUS_COLORS[opp.status] ?? "#6b7280",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            outline: "none",
          }}
        >
          {SHIPLEY_STAGES.map((s) => (
            <option key={s.value} value={s.value} style={{ color: "#000" }}>{s.label}</option>
          ))}
        </select>
        <span
          title="GDA Fit Score — how well this opportunity matches your company's NAICS codes, capabilities, and past performance"
          style={{ fontSize: 18, fontWeight: 700, color: scoreColor(opp.score ?? 0), cursor: "help" }}
        >
          {opp.score ?? 0}
          <span style={{ fontSize: 10, fontWeight: 400, color: "#9ca3af", marginLeft: 2 }}>/ 100 fit</span>
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>
        <span style={{ ...styles.sourceBadge, background: data.source === "db" ? "#166534" : "#1e3a5f" }}>
          {data.source === "n8n" ? "Live API" : "Live DB"}
        </span>
        {opp.id}
        {(opp.raw_source_url || opp.solicitation_number) && (
          <>
            {" · "}
            <a
              href={opp.raw_source_url || `https://sam.gov/search/?keywords=${encodeURIComponent(opp.solicitation_number ?? "")}&sort=-relevance&index=opp`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#60a5fa" }}
            >
              {opp.raw_source_url ? "View on SAM.gov" : "Search SAM.gov"}
            </a>
          </>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
        {[
          { key: "overview", label: "Overview" },
          { key: "analysis", label: "Analysis" },
          { key: "intelligence", label: "Intelligence" },
          { key: "strategy", label: "Strategy" },
          { key: "history", label: "History" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #01696F" : "2px solid transparent",
              background: "none",
              color: activeTab === tab.key ? "#f1f5f9" : "#64748b",
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ======================== OVERVIEW TAB ======================== */}
      {activeTab === "overview" && <>

      {/* Analytics Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <div style={styles.analyticsCard}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Fit Score</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(opp.score ?? 0) }}>{opp.score ?? 0}</div>
        </div>
        <div style={styles.analyticsCard}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Pwin</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: pwin ? scoreColor(Math.round(pwin.overall_pwin * 100)) : "#64748b" }}>{pwin ? `${Math.round(pwin.overall_pwin * 100)}%` : "—"}</div>
        </div>
        <div style={styles.analyticsCard}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Est. Value</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>{formatCurrency(opp.value_estimated)}</div>
        </div>
        <div style={styles.analyticsCard}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Stage</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: STATUS_COLORS[opp.status] ?? "#6b7280", textTransform: "capitalize" }}>{opp.capture_stage ?? opp.status}</div>
        </div>
        <div style={styles.analyticsCard}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Due</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{formatDate(opp.due_date)}</div>
        </div>
      </div>

      {/* Section 1: Core Fields */}
      <Section title="Core Fields">
        <div style={styles.fieldGrid}>
          <Field label="Agency" value={opp.agency} />
          <Field label="Department" value={opp.department} />
          <Field label="Solicitation" value={opp.solicitation_number} />
          <Field label="NAICS" value={opp.naics} />
          <Field label="PSC" value={opp.psc} />
          <Field label="Estimated Value" value={formatCurrency(opp.value_estimated)} />
          <Field label="Probability of Win" value={opp.probability_of_win != null && opp.probability_of_win > 0 ? `${Math.round(opp.probability_of_win * 100)}%` : "—"} />
          <Field label="Due Date" value={formatDate(opp.due_date)} />
          <Field label="Set-Aside" value={opp.set_aside} />
          <Field label="Place of Performance" value={opp.place_of_performance} />
          <Field label="Incumbent" value={opp.incumbent} />
          <Field label="Tags" value={(opp.tags ?? []).length > 0 ? (opp.tags ?? []).join(", ") : "—"} />
        </div>
      </Section>

      {/* Section: Pursuing Entity & Eligibility (W4) */}
      {entityResults && entityResults.length > 0 && (
        <Section title="Entity Eligibility">
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Pursuing Entity:</label>
            <select
              value={pursuingEntity ?? ""}
              onChange={async (e) => {
                const newVal = e.target.value || null;
                setPursuingEntity(newVal);
                setEntitySaving(true);
                try {
                  await authenticatedFetch(`/api/opportunities/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pursuing_entity_id: newVal }),
                  });
                } catch { /* best effort */ }
                setEntitySaving(false);
              }}
              style={{ padding: "4px 8px", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9", fontSize: 13, cursor: "pointer" }}
            >
              <option value="">— Not assigned —</option>
              {entityResults.map(er => (
                <option key={er.entity_id} value={er.entity_id}>{er.legal_name}</option>
              ))}
            </select>
            {entitySaving && <span style={{ fontSize: 12, color: "#94a3b8" }}>Saving...</span>}
            {recommendedEntity && (
              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
                Recommended: {entityResults.find(er => er.entity_id === recommendedEntity)?.legal_name ?? recommendedEntity}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {entityResults.map(er => (
              <div key={er.entity_id} style={{
                padding: 12, borderRadius: 8,
                background: er.eligible ? "#22c55e08" : "#ef444408",
                border: `1px solid ${er.eligible ? "#22c55e33" : "#ef444433"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ color: "#f1f5f9", fontSize: 14 }}>{er.legal_name}</strong>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: er.eligible ? "#22c55e22" : "#ef444422",
                    color: er.eligible ? "#22c55e" : "#ef4444",
                  }}>
                    {er.eligible ? "ELIGIBLE" : "GAPS"}
                  </span>
                </div>
                {er.checks.map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: c.pass ? "#86efac" : "#fca5a5", marginBottom: 2 }}>
                    {c.pass ? "✓" : "✗"} {c.detail}
                  </div>
                ))}
                {er.total_checks === 0 && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>No matching criteria to check</div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Section 1.5: Description / Scope of Work */}
      {opp.description && (
        <Section title="Description / Scope of Work">
          <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{opp.description}</p>
        </Section>
      )}

      {/* Score Explanation */}
      <Section title="Score Breakdown">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>GDA Fit Score</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(opp.score ?? 0) }}>{opp.score ?? 0}<span style={{ fontSize: 12, color: "#6b7280" }}>/100</span></div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Based on NAICS alignment, set-aside match, agency history, and value fit</div>
          </div>
          {opp.probability_of_win != null && opp.probability_of_win > 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>P(Win)</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: (opp.probability_of_win ?? 0) >= 0.6 ? "#22c55e" : (opp.probability_of_win ?? 0) >= 0.3 ? "#f59e0b" : "#ef4444" }}>{Math.round((opp.probability_of_win ?? 0) * 100)}%</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Estimated probability of winning this contract</div>
            </div>
          )}
          {naicsMatch && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>NAICS Match</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: naicsMatch.level === "exact" ? "#22c55e" : naicsMatch.level === "partial" ? "#f59e0b" : "#ef4444" }}>{naicsMatch.level.toUpperCase()}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{naicsMatch.explanation}</div>
            </div>
          )}
          <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Data Source</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa" }}>{opp.data_source ?? "Unknown"}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              {opp.raw_source_url ? (
                <a href={opp.raw_source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa" }}>View original source</a>
              ) : "No direct source link available"}
            </div>
          </div>
        </div>
      </Section>
      </>}

      {/* ======================== ANALYSIS TAB ======================== */}
      {activeTab === "analysis" && <>

      {/* Section 2: Executive Summary */}
      <Section title="Executive Summary">
        {analysis.executive_summary ? (
          <>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{analysis.executive_summary}</p>
            {analysis.recommended_action && (
              <div style={styles.recommendBox}>
                <strong style={{ fontSize: 13, color: "#22c55e" }}>Recommended Action</strong>
                <p style={{ margin: "4px 0 0" }}><Linkify text={analysis.recommended_action} /></p>
              </div>
            )}
          </>
        ) : (
          <div style={{ lineHeight: 1.6, fontSize: 13 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong>{opp.title}</strong> is a {opp.department ?? "federal"} opportunity
              {opp.agency ? ` from ${opp.agency}` : ""}
              {opp.value_estimated ? ` valued at $${(opp.value_estimated / 1_000_000).toFixed(1)}M` : ""}.
              {opp.naics ? ` NAICS: ${opp.naics}.` : ""}
              {opp.set_aside ? ` Set-aside: ${opp.set_aside}.` : ""}
              {opp.due_date ? ` Response deadline: ${new Date(opp.due_date).toLocaleDateString()}.` : ""}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              Current stage: <strong>{({ discovery: "Interest", qualified: "Qualify", pipeline: "Pursue", won: "Won", lost: "Lost", no_bid: "No Bid" } as Record<string, string>)[opp.status] ?? opp.status}</strong>.
              {opp.score > 0 ? ` Fit score: ${opp.score}/100.` : ""}
              {opp.probability_of_win ? ` Estimated Pwin: ${Math.round(opp.probability_of_win * 100)}%.` : ""}
            </p>
            {opp.incumbent && <p style={{ margin: 0 }}>Incumbent: {opp.incumbent}.</p>}
          </div>
        )}
      </Section>

      {/* Section 3: OODA Analysis */}
      <Section title="OODA Analysis">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button
            onClick={handleRunAnalysis}
            disabled={analyzing}
            style={{
              padding: "8px 18px",
              background: analyzing ? "#444" : "linear-gradient(135deg, #01696F, #06b6d4)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: analyzing ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {analyzing ? "Analyzing..." : ooda.observe.items.length > 0 ? "Re-analyze" : "Run AI Analysis"}
          </button>
          {analyzeResult && (
            <span style={{ fontSize: 13, color: analyzeResult.isError ? "#ef4444" : "#22c55e" }}>
              {analyzeResult.message}
            </span>
          )}
        </div>

        {/* NAICS Match Banner */}
        {naicsMatch && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 16,
              background: naicsMatch.canBidAsPrime ? "#22c55e15" : naicsMatch.level === "none" ? "#ef444415" : "#f59e0b15",
              border: `1px solid ${naicsMatch.canBidAsPrime ? "#22c55e44" : naicsMatch.level === "none" ? "#ef444444" : "#f59e0b44"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{naicsMatch.canBidAsPrime ? "\u2705" : naicsMatch.level === "none" ? "\u274c" : "\u26a0\ufe0f"}</span>
              <strong style={{ fontSize: 14, color: naicsMatch.canBidAsPrime ? "#22c55e" : naicsMatch.level === "none" ? "#ef4444" : "#f59e0b" }}>
                NAICS {naicsMatch.canBidAsPrime ? "Match" : "Mismatch"} — {naicsMatch.oppCode}
              </strong>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: naicsMatch.canBidAsPrime ? "#22c55e22" : "#ef444422",
                  color: naicsMatch.canBidAsPrime ? "#22c55e" : "#ef4444",
                  fontWeight: 600,
                }}
              >
                {naicsMatch.score}/20 pts
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#d1d5db", lineHeight: 1.5 }}>{naicsMatch.explanation}</p>
          </div>
        )}

        {/* Observe */}
        <OodaSubSection title="Observe — What We Know" summary={ooda.observe.summary}>
          {ooda.observe.items.length === 0 ? (
            <EmptyState text="No observations recorded yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ooda.observe.items.map((item, i) => (
                <ObserveCard key={i} item={item} sources={sources} />
              ))}
            </div>
          )}
        </OodaSubSection>

        {/* Orient */}
        <OodaSubSection title="Orient — What It Means" summary={ooda.orient.summary}>
          {ooda.orient.items.length === 0 ? (
            <EmptyState text="No orientation analysis available yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ooda.orient.items.map((item, i) => (
                <OrientCard key={i} item={item} sources={sources} />
              ))}
            </div>
          )}
        </OodaSubSection>

        {/* Decide */}
        <OodaSubSection title="Decide — Options & Recommendation" summary={ooda.decide.summary}>
          {ooda.decide.options.length === 0 ? (
            <EmptyState text="No decision options evaluated yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ooda.decide.options.map((opt, i) => (
                <DecideCard key={i} option={opt} />
              ))}
            </div>
          )}
        </OodaSubSection>

        {/* Act */}
        <OodaSubSection title="Act — Next Steps" summary={ooda.act.summary}>
          {ooda.act.next_steps.length === 0 ? (
            <EmptyState text="No action items defined yet." />
          ) : (
            <table style={styles.actTable}>
              <thead>
                <tr>
                  <th style={styles.actTh}>Action</th>
                  <th style={styles.actTh}>Owner</th>
                  <th style={styles.actTh}>Due</th>
                  <th style={styles.actTh}>Priority</th>
                </tr>
              </thead>
              <tbody>
                {ooda.act.next_steps.map((step, i) => (
                  <ActRow key={i} step={step} />
                ))}
              </tbody>
            </table>
          )}
        </OodaSubSection>
      </Section>

      {/* Section 4: Strengths / Risks */}
      <Section title="Strengths & Risks">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h4 style={{ margin: "0 0 8px", color: "#22c55e", fontSize: 14 }}>Strengths</h4>
            {analysis.strengths.length === 0 ? (
              <EmptyState text="No strengths identified." />
            ) : (
              <ul style={styles.bulletList}>
                {analysis.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 style={{ margin: "0 0 8px", color: "#ef4444", fontSize: 14 }}>Risks</h4>
            {analysis.risks.length === 0 ? (
              <EmptyState text="No risks identified." />
            ) : (
              <ul style={styles.bulletList}>
                {analysis.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>
      </>}

      {/* ======================== INTELLIGENCE TAB ======================== */}
      {activeTab === "intelligence" && <>

      {/* Section 5: Pwin Breakdown */}
      {pwin && (
        <Section title={`Pwin Analysis — ${Math.round((pwin.overall_pwin ?? 0) * 100)}%`}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: (pwin.overall_pwin ?? 0) >= 0.6 ? "#22c55e" : (pwin.overall_pwin ?? 0) >= 0.4 ? "#f59e0b" : "#ef4444" }}>
                {Math.round((pwin.overall_pwin ?? 0) * 100)}%
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Overall Pwin</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#6b7280" }}>{Math.round((pwin.historical_win_rate ?? 0) * 100)}%</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Historical Win Rate</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ ...styles.badge, background: pwin.confidence === "high" ? "#166534" : pwin.confidence === "medium" ? "#92400e" : "#991b1b", fontSize: 12, padding: "4px 10px" }}>
                {pwin.confidence} confidence
              </span>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={styles.sourceTh}>Factor</th>
                <th style={{ ...styles.sourceTh, textAlign: "center" }}>Weight</th>
                <th style={{ ...styles.sourceTh, textAlign: "center" }}>Score</th>
                <th style={{ ...styles.sourceTh, textAlign: "center" }}>Weighted</th>
                <th style={styles.sourceTh}>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {(pwin.factors ?? []).map((f) => (
                <tr key={f.name}>
                  <td style={{ ...styles.sourceTd, fontWeight: 600 }}>{f.name}</td>
                  <td style={{ ...styles.sourceTd, textAlign: "center" }}>{Math.round(f.weight * 100)}%</td>
                  <td style={{ ...styles.sourceTd, textAlign: "center" }}>
                    <span style={{ color: f.score >= 0.7 ? "#22c55e" : f.score >= 0.5 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>
                      {Math.round(f.score * 100)}
                    </span>
                  </td>
                  <td style={{ ...styles.sourceTd, textAlign: "center", fontWeight: 600 }}>{(f.weighted_score * 100).toFixed(1)}</td>
                  <td style={{ ...styles.sourceTd, color: "#9ca3af", fontSize: 12 }}>{f.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>{pwin.methodology}</div>
        </Section>
      )}

      {/* Section 6: Incumbent Analysis */}
      {incumbent && (
        <Section title={`Incumbent: ${incumbent.incumbent_name}`}>
          <div style={styles.fieldGrid}>
            <Field label="Contract" value={incumbent.contract_number} />
            <Field label="Value" value={formatCurrency(incumbent.contract_value)} />
            <Field label="Period" value={`${formatDate(incumbent.contract_start)} — ${formatDate(incumbent.contract_end)}`} />
            <Field label="CPARS Rating" value={incumbent.performance_rating ? incumbent.performance_rating.charAt(0).toUpperCase() + incumbent.performance_rating.slice(1) : "—"} />
            <Field label="Recompete Advantage" value={incumbent.recompete_advantage != null ? `+${Math.round(incumbent.recompete_advantage * 100)}%` : "—"} />
            <Field label="Protest Risk" value={incumbent.protest_risk ? incumbent.protest_risk.charAt(0).toUpperCase() + incumbent.protest_risk.slice(1) : "—"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <strong style={{ fontSize: 13, color: "#22c55e" }}>Strengths</strong>
              <ul style={styles.bulletList}>{(incumbent.strengths ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "#ef4444" }}>Weaknesses</strong>
              <ul style={styles.bulletList}>{(incumbent.weaknesses ?? []).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          </div>
          {(incumbent.key_personnel ?? []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Key Personnel</strong>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                {(incumbent.key_personnel ?? []).map((p) => (
                  <span key={p.name} style={{ padding: "4px 10px", background: "rgba(107,114,128,0.1)", borderRadius: 4, fontSize: 12 }}>
                    {p.name} — {p.role} ({p.years_on_contract}yr)
                  </span>
                ))}
              </div>
            </div>
          )}
          <p style={{ marginTop: 12, fontSize: 13, color: "#9ca3af", lineHeight: 1.5 }}>{incumbent.notes}</p>
        </Section>
      )}

      {/* Section 7: Competitor Field */}
      {competitors && (
        <Section title={`Competitor Field — ${competitors.total_expected_bidders ?? 0} Expected Bidders (We're #${competitors.our_position ?? "?"})`}>
          <p style={{ margin: "0 0 12px", lineHeight: 1.6, fontSize: 13, color: "#9ca3af" }}>{competitors.market_analysis}</p>
          {(competitors.competitors ?? []).map((c) => (
            <div key={c.id} style={{ padding: 12, marginBottom: 8, background: "rgba(107,114,128,0.05)", borderRadius: 6, border: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{c.name}</strong>
                  <span style={{ ...styles.badge, background: c.threat_level === "high" ? "#991b1b" : c.threat_level === "medium" ? "#92400e" : "#166534" }}>
                    {c.threat_level} threat
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{c.size_status?.toUpperCase() ?? ""}</span>
                </div>
                <span style={{ fontWeight: 600, color: (c.estimated_pwin ?? 0) >= 0.3 ? "#ef4444" : "#f59e0b" }}>
                  Est. Pwin: {Math.round((c.estimated_pwin ?? 0) * 100)}%
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><span style={{ color: "#22c55e" }}>+</span> {(c.strengths ?? []).slice(0, 3).join(" · ")}</div>
                <div><span style={{ color: "#ef4444" }}>−</span> {(c.weaknesses ?? []).slice(0, 2).join(" · ")}</div>
              </div>
              {(c.likely_teaming ?? []).length > 0 && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Likely teaming: {(c.likely_teaming ?? []).join(", ")}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Section 8: Black Hat Analysis */}
      {blackHat && (
        <Section title="Black Hat Analysis">
          <div style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 13, color: "#01696F" }}>Our Discriminators</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {(blackHat.our_discriminators ?? []).map((d, i) => (
                <span key={i} style={{ padding: "4px 10px", background: "rgba(59,130,246,0.1)", borderRadius: 12, fontSize: 12, color: "#60a5fa" }}>
                  {d}
                </span>
              ))}
            </div>
          </div>
          {(blackHat.scenarios ?? []).map((s, i) => (
            <details key={i} style={{ marginBottom: 8, border: "1px solid var(--color-border)", borderRadius: 6, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>🎯 {s.competitor} — Black Hat Scenario</summary>
              <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                <p><strong>Strategy:</strong> {s.likely_strategy}</p>
                <p><strong>Technical Approach:</strong> {s.technical_approach}</p>
                <p><strong>Pricing:</strong> {s.pricing_strategy}</p>
                <p><strong>Teaming:</strong> {s.teaming_strategy}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                  <div>
                    <strong style={{ color: "#ef4444", fontSize: 12 }}>Their Discriminators</strong>
                    <ul style={styles.bulletList}>{(s.discriminators ?? []).map((d, j) => <li key={j}>{d}</li>)}</ul>
                  </div>
                  <div>
                    <strong style={{ color: "#22c55e", fontSize: 12 }}>Their Vulnerabilities</strong>
                    <ul style={styles.bulletList}>{(s.vulnerabilities ?? []).map((v, j) => <li key={j}>{v}</li>)}</ul>
                  </div>
                </div>
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(59,130,246,0.08)", borderRadius: 6 }}>
                  <strong style={{ fontSize: 12, color: "#01696F" }}>Counter Strategy:</strong>
                  <p style={{ margin: "4px 0 0" }}>{s.counter_strategy}</p>
                </div>
              </div>
            </details>
          ))}
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13 }}>Key Takeaways</strong>
            <ul style={styles.bulletList}>{(blackHat.key_takeaways ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </Section>
      )}

      {/* Section 9: Wargame Scenarios */}
      {wargame && (
        <Section title="Wargame Scenarios">
          <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.08)", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            <strong>Recommended Strategy:</strong> {wargame.recommended_strategy}
            <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>Confidence: {Math.round((wargame.confidence ?? 0) * 100)}%</div>
          </div>
          {(wargame.scenarios ?? []).map((s) => (
            <div key={s.id} style={{ padding: 12, marginBottom: 8, border: "1px solid var(--color-border)", borderRadius: 6, borderLeft: `3px solid ${s.risk_level === "high" ? "#ef4444" : s.risk_level === "medium" ? "#f59e0b" : "#22c55e"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>{s.name}</strong>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Probability: {Math.round((s.probability ?? 0) * 100)}%</span>
                  <span style={{ ...styles.badge, background: s.risk_level === "high" ? "#991b1b" : s.risk_level === "medium" ? "#92400e" : "#166534" }}>
                    {s.risk_level}
                  </span>
                </div>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#d1d5db" }}>{s.description}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><strong style={{ color: "#01696F" }}>Our Move:</strong><br />{s.our_move}</div>
                <div><strong style={{ color: "#ef4444" }}>Competitor Response:</strong><br />{s.competitor_response}</div>
                <div><strong style={{ color: "#f59e0b" }}>Outcome:</strong><br />{s.outcome}</div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Section 10: Competitive Landscape (Text) */}
      <Section title="Competitive Landscape Summary">
        {analysis.competitive_landscape ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}><Linkify text={analysis.competitive_landscape} /></p>
        ) : (
          <EmptyState text="No competitive intelligence available for this opportunity." />
        )}
      </Section>
      </>}

      {/* ======================== STRATEGY TAB ======================== */}
      {activeTab === "strategy" && <>

      {/* Section 11: Sources (strategy context) */}
      <Section title="Sources">
        {(sources ?? []).length === 0 ? (
          <EmptyState text="No external sources are associated with this analysis." />
        ) : (
          <table style={styles.sourceTable}>
            <thead>
              <tr>
                <th style={styles.sourceTh}>Title</th>
                <th style={styles.sourceTh}>Type</th>
                <th style={styles.sourceTh}>Publisher</th>
                <th style={styles.sourceTh}>Published</th>
                <th style={styles.sourceTh}>Relevance</th>
              </tr>
            </thead>
            <tbody>
              {(sources ?? []).map((src) => (
                <tr key={src.id} id={`source-${src.id}`}>
                  <td style={styles.sourceTd}>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                        {src.title}
                      </a>
                    ) : (
                      src.title
                    )}
                  </td>
                  <td style={styles.sourceTd}>
                    <span style={{ ...styles.typeBadge }}>{(src.type ?? "").replace(/_/g, " ")}</span>
                  </td>
                  <td style={styles.sourceTd}>{src.publisher ?? "—"}</td>
                  <td style={styles.sourceTd}>{formatDate(src.published_at)}</td>
                  <td style={{ ...styles.sourceTd, fontSize: 12, color: "#9ca3af" }}>
                    {src.relevance_reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Section 7: Learning & Feedback */}
      <Section title="Learning & Feedback">
        <div style={styles.fieldGrid}>
          <Field label="Source Count" value={String(learning.source_count)} />
          <Field label="Last Analyzed" value={formatDate(analysis.last_analyzed_at)} />
          <Field label="Feedback Submitted" value={learning.feedback_submitted ? "Yes" : "No"} />
          <Field label="Next Review" value={formatDate(learning.next_review_at)} />
        </div>
        {(learning?.coverage_gaps ?? []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13, color: "#f59e0b" }}>Coverage Gaps</strong>
            <ul style={styles.bulletList}>
              {(learning?.coverage_gaps ?? []).map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(107,114,128,0.1)", borderRadius: 6, fontSize: 13, color: "#9ca3af" }}>
          Feedback controls will be available in a future sprint.
        </div>
      </Section>

      {/* Section: Capture Coach — AI Strategy Advisor */}
      <Section title="Capture Coach — AI Strategy">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>
            {coachAnalysis
              ? `Last generated: ${coachAnalysis.generated_at ? new Date(coachAnalysis.generated_at).toLocaleString() : "Unknown"} (${coachAnalysis.model_used ?? "Unknown"})`
              : "No strategy generated yet. Click to analyze this opportunity."}
          </div>
          <button
            onClick={handleCaptureCoach}
            disabled={coachLoading}
            style={{
              padding: "8px 18px",
              background: coachLoading ? "#444" : "linear-gradient(135deg, #8b5cf6, #ec4899)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: coachLoading ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {coachLoading ? "Generating Strategy..." : coachAnalysis ? "Regenerate Strategy" : "Generate Strategy"}
          </button>
        </div>

        {coachResult && (
          <div style={{
            padding: "10px 14px",
            background: coachResult.isError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
            border: `1px solid ${coachResult.isError ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`,
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
            color: coachResult.isError ? "#ef4444" : "#22c55e",
          }}>
            {coachResult.message}
          </div>
        )}

        {coachAnalysis && (
          <div>
            {/* Executive Summary */}
            <div style={{ padding: "12px 16px", background: "rgba(139,92,246,0.08)", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
              <strong style={{ color: "#8b5cf6" }}>Executive Summary</strong>
              <p style={{ margin: "6px 0 0" }}>{coachAnalysis.executive_summary}</p>
            </div>

            {/* Win Probability */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ textAlign: "center", padding: "12px 20px", background: "var(--color-surface)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: scoreColor(coachAnalysis.win_probability?.score ?? 0) }}>
                  {coachAnalysis.win_probability?.score ?? 0}%
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Win Probability</div>
                <div style={{ fontSize: 11, color: coachAnalysis.win_probability?.confidence === "high" ? "#22c55e" : coachAnalysis.win_probability?.confidence === "medium" ? "#f59e0b" : "#ef4444", fontWeight: 600, marginTop: 2 }}>
                  {coachAnalysis.win_probability?.confidence ?? "low"} confidence
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 300 }}>
                <strong style={{ fontSize: 13, color: "#d1d5db" }}>Win Factors</strong>
                <div style={{ marginTop: 6 }}>
                  {(coachAnalysis.win_probability?.factors ?? []).map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ color: f.impact === "positive" ? "#22c55e" : f.impact === "negative" ? "#ef4444" : "#9ca3af", fontWeight: 700, minWidth: 14 }}>
                        {f.impact === "positive" ? "+" : f.impact === "negative" ? "-" : "~"}
                      </span>
                      <span><strong>{f.factor}:</strong> {f.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Capture Strategy */}
            <details open style={{ marginBottom: 12, border: "1px solid var(--color-border)", borderRadius: 6, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#01696F" }}>Capture Strategy</summary>
              <p style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.6 }}>{coachAnalysis.capture_strategy?.approach ?? ""}</p>
              {(coachAnalysis.capture_strategy?.win_themes ?? []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 12, color: "#22c55e" }}>Win Themes</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {(coachAnalysis.capture_strategy?.win_themes ?? []).map((t, i) => (
                      <span key={i} style={{ padding: "3px 10px", background: "rgba(34,197,94,0.12)", borderRadius: 12, fontSize: 12, color: "#22c55e" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {(coachAnalysis.capture_strategy?.discriminators ?? []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 12, color: "#8b5cf6" }}>Discriminators</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {(coachAnalysis.capture_strategy?.discriminators ?? []).map((d, i) => (
                      <span key={i} style={{ padding: "3px 10px", background: "rgba(139,92,246,0.12)", borderRadius: 12, fontSize: 12, color: "#8b5cf6" }}>{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {(coachAnalysis.capture_strategy?.teaming_recommendations ?? []).length > 0 && (
                <div>
                  <strong style={{ fontSize: 12, color: "#f59e0b" }}>Teaming Recommendations</strong>
                  {(coachAnalysis.capture_strategy?.teaming_recommendations ?? []).map((t, i) => (
                    <div key={i} style={{ padding: "6px 0", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <strong>{t.partner_type}:</strong> {t.rationale}
                    </div>
                  ))}
                </div>
              )}
            </details>

            {/* Gap Analysis */}
            {(coachAnalysis.gap_analysis ?? []).length > 0 && (
              <details open style={{ marginBottom: 12, border: "1px solid var(--color-border)", borderRadius: 6, padding: "10px 14px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#f59e0b" }}>Gap Analysis ({(coachAnalysis.gap_analysis ?? []).length})</summary>
                <div style={{ marginTop: 8 }}>
                  {(coachAnalysis.gap_analysis ?? []).map((g, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{g.gap}</strong>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: g.severity === "critical" ? "#991b1b" : g.severity === "high" ? "#92400e" : g.severity === "medium" ? "#854d0e" : "#1e3a5f", color: "#fff" }}>
                          {g.severity}
                        </span>
                      </div>
                      <div style={{ color: "#9ca3af", marginTop: 4 }}>{g.mitigation}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Risk Assessment */}
            {(coachAnalysis.risk_assessment ?? []).length > 0 && (
              <details open style={{ marginBottom: 12, border: "1px solid var(--color-border)", borderRadius: 6, padding: "10px 14px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#ef4444" }}>Risk Assessment ({(coachAnalysis.risk_assessment ?? []).length})</summary>
                <div style={{ marginTop: 8 }}>
                  {(coachAnalysis.risk_assessment ?? []).map((r, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{r.risk}</strong>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>L: {r.likelihood}</span>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>I: {r.impact}</span>
                        </div>
                      </div>
                      <div style={{ color: "#9ca3af", marginTop: 4 }}>{r.mitigation}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Next Actions */}
            {(coachAnalysis.next_actions ?? []).length > 0 && (
              <details open style={{ marginBottom: 12, border: "1px solid var(--color-border)", borderRadius: 6, padding: "10px 14px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#22c55e" }}>Next Actions ({(coachAnalysis.next_actions ?? []).length})</summary>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", color: "#9ca3af", fontSize: 11 }}>Action</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", color: "#9ca3af", fontSize: 11 }}>Priority</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", color: "#9ca3af", fontSize: 11 }}>Owner</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", color: "#9ca3af", fontSize: 11 }}>Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(coachAnalysis.next_actions ?? []).map((a, i) => (
                      <tr key={i}>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{a.action}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: a.priority === "critical" ? "#991b1b" : a.priority === "high" ? "#92400e" : a.priority === "medium" ? "#854d0e" : "#1e3a5f", color: "#fff" }}>
                            {a.priority}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#9ca3af" }}>{a.owner}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#9ca3af" }}>{a.timeline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </Section>
      </>}

      {/* ======================== HISTORY TAB ======================== */}
      {activeTab === "history" && <>

      {/* Activity Timeline */}
      <Section title="Activity Timeline">
        {timeline.length === 0 ? (
          <EmptyState text="No activity recorded for this opportunity." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {timeline.map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: 12, padding: "10px 14px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, flexShrink: 0, background: ev.type === "create" ? "#22c55e" : "#01696F" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.summary}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{formatDate(ev.timestamp)} · {ev.actor}</div>
                </div>
                <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase" as const }}>{ev.type}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section: Version History */}
      <Section title="Version History">
        <VersionHistory
          table="opportunities"
          recordId={id ?? ""}
          onRestore={() => {
            if (id) {
              fetchOpportunityDetail(id).then((env) => { if (env.success && env.data) setData(env.data); });
            }
          }}
        />
      </Section>
      </>}

      {/* Section: Ask AI (always visible) */}
      <div style={{ marginTop: 24 }}>
        <AskAIChat opportunityId={id ?? ""} opportunityTitle={opp.title} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Linkify({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s),]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>
            {part.length > 60 ? part.slice(0, 57) + "..." : part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function OodaSubSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={styles.subSectionTitle}>{title}</h3>
      {summary && <p style={{ margin: "0 0 10px", color: "#d1d5db", fontSize: 14 }}>{summary}</p>}
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={styles.fieldValue}>{value || "—"}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={{ color: "#6b7280", fontStyle: "italic", margin: "8px 0" }}>{text}</p>;
}

function SourceChip({ sourceId, sources }: { sourceId: string; sources: OpportunitySourceRow[] }) {
  const src = sources.find((s) => s.id === sourceId);
  if (!src) return null;
  return (
    <span
      style={styles.sourceChip}
      title={`${src.title} — see Strategy tab for details`}
    >
      {src.type.replace(/_/g, " ")}
    </span>
  );
}

function ObserveCard({ item, sources }: { item: OodaObserveItem; sources: OpportunitySourceRow[] }) {
  return (
    <div style={styles.oodaCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{item.label}</strong>
        <div style={{ display: "flex", gap: 4 }}>
          {item.source_ids.map((sid) => (
            <SourceChip key={sid} sourceId={sid} sources={sources} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{item.value}</div>
    </div>
  );
}

function OrientCard({ item, sources }: { item: OodaOrientItem; sources: OpportunitySourceRow[] }) {
  return (
    <div style={styles.oodaCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{item.label}</strong>
          <span
            style={{
              ...styles.typeBadge,
              background: `${orientTypeColor(item.type)}22`,
              color: orientTypeColor(item.type),
            }}
          >
            {item.type}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {item.source_ids.map((sid) => (
            <SourceChip key={sid} sourceId={sid} sources={sources} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{item.value}</div>
    </div>
  );
}

function DecideCard({ option }: { option: OodaDecideOption }) {
  return (
    <div
      style={{
        ...styles.oodaCard,
        borderLeft: option.recommended ? "3px solid #22c55e" : "3px solid #374151",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{option.label}</strong>
        {option.recommended && (
          <span style={{ ...styles.typeBadge, background: "#22c55e22", color: "#22c55e" }}>
            Recommended
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, marginTop: 4, color: "#d1d5db" }}>{option.rationale}</div>
    </div>
  );
}

function ActRow({ step }: { step: OodaActStep }) {
  return (
    <tr>
      <td style={styles.actTd}>
        <div><Linkify text={step.action} /></div>
        {step.resource_url && (
          <a
            href={step.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}
          >
            View Resource →
          </a>
        )}
      </td>
      <td style={styles.actTd}>{step.owner ?? "—"}</td>
      <td style={styles.actTd}>{formatDate(step.due_date)}</td>
      <td style={styles.actTd}>
        <span style={{ color: priorityColor(step.priority), fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>
          {step.priority}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  skeleton: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: 6,
    height: 24,
    width: "80%",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#60a5fa",
    cursor: "pointer",
    fontSize: 14,
    padding: 0,
    marginBottom: 16,
  },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    padding: 20,
    color: "#fca5a5",
  },
  badge: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    textTransform: "capitalize" as const,
  },
  sourceBadge: {
    display: "inline-block",
    padding: "1px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    marginRight: 8,
  },
  section: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 20,
    marginTop: 20,
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  subSectionTitle: {
    margin: "0 0 8px",
    fontSize: 14,
    fontWeight: 600,
    color: "#d1d5db",
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "14px 24px",
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: "#9ca3af",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 14,
  },
  recommendBox: {
    marginTop: 14,
    padding: "10px 14px",
    background: "rgba(34,197,94,0.08)",
    borderLeft: "3px solid #22c55e",
    borderRadius: 6,
  },
  bulletList: {
    margin: "4px 0 0 18px",
    padding: 0,
    lineHeight: 1.7,
    fontSize: 14,
  },
  oodaCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 6,
    padding: "10px 14px",
  },
  sourceChip: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 600,
    background: "rgba(96,165,250,0.15)",
    color: "#60a5fa",
    cursor: "pointer",
  },
  typeBadge: {
    display: "inline-block",
    padding: "1px 7px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(255,255,255,0.06)",
    color: "#d1d5db",
  },
  sourceTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  sourceTh: {
    textAlign: "left" as const,
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
  },
  sourceTd: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "top" as const,
  },
  actTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  actTh: {
    textAlign: "left" as const,
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
  },
  actTd: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "top" as const,
  },
  analyticsCard: {
    padding: "14px 16px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    textAlign: "center" as const,
  },
};
