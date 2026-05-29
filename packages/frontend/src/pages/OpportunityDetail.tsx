import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import AskAIChat from "../components/AskAIChat";
import SourceBadge from "../components/SourceBadge";
import FieldWithSource from "../components/opportunity/FieldWithSource";
import VersionHistory from "../components/VersionHistory";
import { authenticatedFetch } from "../api/auth";
import {
  fetchOpportunityDetail,
  fetchOpportunityAnalysis,
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
  type SourceRef,
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

const STATUS_CLASS: Record<string, string> = {
  discovery: "status-discovery",
  qualified: "status-qualified",
  pipeline: "status-pipeline",
  lost: "status-lost",
  won: "status-won",
  no_bid: "status-no-bid",
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
  if (n == null) return "\u2014";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function scoreClass(score: number): string {
  if (score >= 80) return "score-high";
  if (score >= 60) return "score-mid";
  return "score-low";
}

function priorityClass(p: string): string {
  if (p === "high") return "priority-high";
  if (p === "medium") return "priority-mid";
  return "priority-low";
}

function orientTypeClass(t: string): string {
  if (t === "strength") return "orient-strength";
  if (t === "risk") return "orient-risk";
  if (t === "inference") return "orient-inference";
  return "orient-default";
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<OpportunityDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pwin, setPwin] = useState<(PwinBreakdownData & { sources?: SourceRef[] }) | null>(null);
  const [incumbent, setIncumbent] = useState<(IncumbentData & { sources?: SourceRef[] }) | null>(null);
  const [competitors, setCompetitors] = useState<(CompetitorFieldData & { sources?: SourceRef[] }) | null>(null);
  const [blackHat, setBlackHat] = useState<(BlackHatAnalysisData & { sources?: SourceRef[] }) | null>(null);
  const [wargame, setWargame] = useState<(WargameAnalysisData & { sources?: SourceRef[] }) | null>(null);

  // Activity timeline state
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  // Global analysis sources (R1)
  const [analysisSources, setAnalysisSources] = useState<SourceRef[]>([]);

  // Auto-analysis progress (R2)
  const [analysisPanelsReady, setAnalysisPanelsReady] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  // Capture Coach state
  const [coachAnalysis, setCoachAnalysis] = useState<CaptureCoachAnalysis | null>(null);

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
    setTimeline([]);
    setAnalysisSources([]);
    setAnalysisPanelsReady(0);
    setAnalysisComplete(false);

    // R2: Auto-fetch combined analysis on mount — single endpoint, Promise.all on backend
    fetchOpportunityAnalysis(id)
      .then((env) => {
        if (!env.success || !env.data) return;
        const d = env.data;
        let ready = 0;
        if (d.pwin && typeof d.pwin.overall_pwin === "number" && Array.isArray(d.pwin.factors)) {
          setPwin(d.pwin);
          ready++;
        }
        if (d.incumbent && typeof d.incumbent.incumbent_name === "string") {
          setIncumbent(d.incumbent);
          ready++;
        }
        if (d.competitors && Array.isArray(d.competitors.competitors)) {
          setCompetitors(d.competitors);
          ready++;
        }
        if (d.blackhat && Array.isArray(d.blackhat.scenarios)) {
          setBlackHat(d.blackhat);
          ready++;
        }
        if (d.wargame && Array.isArray(d.wargame.scenarios)) {
          setWargame(d.wargame);
          ready++;
        }
        if (Array.isArray(d.timeline)) {
          setTimeline(d.timeline);
          ready++;
        }
        if (Array.isArray(d.sources)) {
          setAnalysisSources(d.sources);
          ready++;
        }
        setAnalysisPanelsReady(ready);
        setAnalysisComplete(true);
      })
      .catch(() => {
        setAnalysisComplete(true);
      });

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
      <div className="opp-detail-page">
        <div className="skeleton" />
        <div className="skeleton" style={{ width: "60%", marginTop: 12 }} />
        <div className="skeleton" style={{ height: 200, marginTop: 24 }} />
        <div className="skeleton" style={{ height: 150, marginTop: 16 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="opp-detail-page">
        <button onClick={() => navigate(backPath)} className="btn">
          &larr; {backLabel}
        </button>
        <div className="opp-error-box">
          <strong>Error loading opportunity detail</strong>
          <p>{error ?? "No data returned."}</p>
          <p className="caption">
            workflow: gda-opportunity-detail &middot; action: read
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

  // Pwin breakdown summary for overview (decision 8)
  const pwinFactors = pwin?.factors ?? [];
  const pwinPositive = pwinFactors.filter((f) => f.score >= 0.6).length;
  const pwinNeutral = pwinFactors.filter((f) => f.score >= 0.4 && f.score < 0.6).length;
  const pwinNegative = pwinFactors.filter((f) => f.score < 0.4).length;
  const pwinPct = pwin ? Math.round((pwin.overall_pwin ?? 0) * 100) : null;

  return (
    <div className="opp-detail-page">
      {/* Breadcrumb */}
      <div className="opp-breadcrumb">
        <a onClick={() => navigate(backPath)}>
          {backLabel}
        </a>
        {" > "}
        <span>{opp.title}</span>
      </div>

      {/* Analyzing strip (R2) */}
      {!analysisComplete && (
        <div className="analyzing-strip">
          Analyzing &mdash; {analysisPanelsReady} of 7 panels ready
        </div>
      )}

      {/* Header */}
      <div className="opp-header">
        <h1>{opp.title} <SourceBadge source={opp.data_source} size="md" /></h1>
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
          className={`btn-primary ${STATUS_CLASS[opp.status] ?? ""}`}
          style={{ borderRadius: 4, fontSize: 13, cursor: "pointer" }}
        >
          {SHIPLEY_STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <span
          title="GDA Fit Score"
          className={`opp-analytics-value ${scoreClass(opp.score ?? 0)}`}
          style={{ fontSize: 18, cursor: "help" }}
        >
          {opp.score ?? 0}
          <span className="caption" style={{ marginLeft: 2 }}>/ 100 fit</span>
        </span>
      </div>
      <div className="opp-meta">
        <span className="opp-badge" style={{ marginRight: 8 }}>
          {data.source === "n8n" ? "Live API" : "Live DB"}
        </span>
        {opp.id}
        {(opp.raw_source_url || opp.solicitation_number) && (
          <>
            {" \u00b7 "}
            <a
              href={opp.raw_source_url || `https://sam.gov/search/?keywords=${encodeURIComponent(opp.solicitation_number ?? "")}&sort=-relevance&index=opp`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {opp.raw_source_url ? "View on SAM.gov" : "Search SAM.gov"}
            </a>
          </>
        )}
      </div>

      {/* Tab Bar */}
      <div className="opp-tab-bar">
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
            className={`opp-tab${activeTab === tab.key ? " active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ======================== OVERVIEW TAB ======================== */}
      {activeTab === "overview" && <>

      {/* Analytics Strip */}
      <div className="opp-analytics-grid">
        <div className="opp-analytics-card">
          <div className="opp-analytics-label">Fit Score</div>
          <div className={`opp-analytics-value ${scoreClass(opp.score ?? 0)}`}>{opp.score ?? 0}</div>
        </div>
        <div className="opp-analytics-card">
          <div className="opp-analytics-label">Pwin</div>
          <div className={`opp-analytics-value ${pwinPct != null ? scoreClass(pwinPct) : ""}`}>
            {pwinPct != null ? `${pwinPct}%` : "\u2014"}
          </div>
        </div>
        <div className="opp-analytics-card">
          <div className="opp-analytics-label">Est. Value</div>
          <div className="opp-analytics-value">{formatCurrency(opp.value_estimated)}</div>
        </div>
        <div className="opp-analytics-card">
          <div className="opp-analytics-label">Stage</div>
          <div className="opp-analytics-value" style={{ fontSize: 14, textTransform: "capitalize" }}>{opp.capture_stage ?? opp.status}</div>
        </div>
        <div className="opp-analytics-card">
          <div className="opp-analytics-label">Due</div>
          <div className="opp-analytics-value" style={{ fontSize: 14 }}>{formatDate(opp.due_date)}</div>
        </div>
      </div>

      {/* Pwin rubric (decision 8) */}
      {pwinPct != null && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <FieldWithSource
            label="Probability of Win"
            value={`${pwinPct}% \u2014 pwin breakdown: ${pwinPositive} of ${pwinFactors.length} factors positive, ${pwinNeutral} neutral, ${pwinNegative} negative.`}
            sources={pwin?.sources ?? analysisSources}
          />
          <a
            onClick={() => setActiveTab("intelligence")}
            className="caption"
            style={{ cursor: "pointer", marginTop: 4, display: "inline-block" }}
          >
            View breakdown &rarr;
          </a>
        </div>
      )}

      {/* Section 1: Core Fields — now FieldWithSource (R1) */}
      <Section title="Core Fields">
        <div className="opp-field-grid">
          <FieldWithSource label="Agency" value={opp.agency} sources={analysisSources} />
          <FieldWithSource label="Department" value={opp.department} sources={analysisSources} />
          <FieldWithSource label="Solicitation" value={opp.solicitation_number} sources={analysisSources} />
          <FieldWithSource label="NAICS" value={opp.naics} sources={analysisSources} />
          <FieldWithSource label="PSC" value={opp.psc} sources={analysisSources} />
          <FieldWithSource label="Estimated Value" value={formatCurrency(opp.value_estimated)} sources={analysisSources} />
          <FieldWithSource
            label="Probability of Win"
            value={pwinPct != null ? `${pwinPct}%` : "\u2014"}
            sources={pwin?.sources ?? analysisSources}
          />
          <FieldWithSource label="Due Date" value={formatDate(opp.due_date)} sources={analysisSources} />
          <FieldWithSource label="Set-Aside" value={opp.set_aside} sources={analysisSources} />
          <FieldWithSource label="Place of Performance" value={opp.place_of_performance} sources={analysisSources} />
          {/* Decision 7: Incumbent always shows name + SourceBadge */}
          <FieldWithSource
            label="Incumbent"
            value={opp.incumbent || "Unidentified"}
            sources={incumbent?.sources ?? analysisSources}
          />
          <FieldWithSource label="Tags" value={(opp.tags ?? []).length > 0 ? (opp.tags ?? []).join(", ") : "\u2014"} sources={analysisSources} />
        </div>
      </Section>

      {/* Section: Pursuing Entity & Eligibility (W4) */}
      {entityResults && entityResults.length > 0 && (
        <Section title="Entity Eligibility">
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <label className="opp-field-label" style={{ marginBottom: 0 }}>Pursuing Entity:</label>
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
              className="btn"
              style={{ cursor: "pointer" }}
            >
              <option value="">-- Not assigned --</option>
              {entityResults.map(er => (
                <option key={er.entity_id} value={er.entity_id}>{er.legal_name}</option>
              ))}
            </select>
            {entitySaving && <span className="caption">Saving...</span>}
            {recommendedEntity && (
              <span className="caption" style={{ fontWeight: 600 }}>
                Recommended: {entityResults.find(er => er.entity_id === recommendedEntity)?.legal_name ?? recommendedEntity}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {entityResults.map(er => (
              <div key={er.entity_id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>{er.legal_name}</strong>
                  <span className={`opp-badge ${er.eligible ? "badge-eligible" : "badge-gaps"}`}>
                    {er.eligible ? "ELIGIBLE" : "GAPS"}
                  </span>
                </div>
                {er.checks.map((c, i) => (
                  <div key={i} className={`caption ${c.pass ? "check-pass" : "check-fail"}`}>
                    {c.pass ? "PASS" : "FAIL"} {c.detail}
                  </div>
                ))}
                {er.total_checks === 0 && (
                  <div className="caption">No matching criteria to check</div>
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
          <div className="card" style={{ padding: 12 }}>
            <div className="opp-field-label">GDA Fit Score</div>
            <div className={`opp-analytics-value ${scoreClass(opp.score ?? 0)}`} style={{ fontSize: 24 }}>{opp.score ?? 0}<span className="caption">/100</span></div>
            <div className="caption" style={{ marginTop: 4 }}>Based on NAICS alignment, set-aside match, agency history, and value fit</div>
          </div>
          {opp.probability_of_win != null && opp.probability_of_win > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div className="opp-field-label">P(Win)</div>
              <div className={`opp-analytics-value ${scoreClass(Math.round((opp.probability_of_win ?? 0) * 100))}`} style={{ fontSize: 24 }}>{Math.round((opp.probability_of_win ?? 0) * 100)}%</div>
              <div className="caption" style={{ marginTop: 4 }}>Estimated probability of winning this contract</div>
            </div>
          )}
          {naicsMatch && (
            <div className="card" style={{ padding: 12 }}>
              <div className="opp-field-label">NAICS Match</div>
              <div className={`opp-analytics-value ${naicsMatch.level === "exact" ? "score-high" : naicsMatch.level === "partial" ? "score-mid" : "score-low"}`} style={{ fontSize: 24 }}>{naicsMatch.level.toUpperCase()}</div>
              <div className="caption" style={{ marginTop: 4 }}>{naicsMatch.explanation}</div>
            </div>
          )}
          <div className="card" style={{ padding: 12 }}>
            <div className="opp-field-label">Data Source</div>
            <div className="opp-analytics-value" style={{ fontSize: 16 }}>
              <SourceBadge source={opp.data_source} hideManual={false} size="md" />
            </div>
            <div className="caption" style={{ marginTop: 4 }}>Where this opportunity was originally discovered</div>
          </div>
        </div>
      </Section>

      {/* Section 4: Strengths / Risks */}
      <Section title="Strengths & Risks">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h4 className="opp-sub-section-title">Strengths</h4>
            {analysis.strengths.length === 0 ? (
              <EmptyState text="No strengths identified." />
            ) : (
              <ul className="opp-bullet-list">
                {analysis.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="opp-sub-section-title">Risks</h4>
            {analysis.risks.length === 0 ? (
              <EmptyState text="No risks identified." />
            ) : (
              <ul className="opp-bullet-list">
                {analysis.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
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
              <div className="opp-recommend-box">
                <strong className="opp-sub-section-title">Recommended Action</strong>
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

      {/* Section 3: OODA Analysis — auto-loaded (R2, no button) */}
      <Section title="OODA Analysis">

        {/* NAICS Match Banner */}
        {naicsMatch && (
          <div className={`card ${naicsMatch.canBidAsPrime ? "naics-match" : naicsMatch.level === "none" ? "naics-none" : "naics-partial"}`} style={{ padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <strong className={naicsMatch.canBidAsPrime ? "score-high" : naicsMatch.level === "none" ? "score-low" : "score-mid"} style={{ fontSize: 14 }}>
                NAICS {naicsMatch.canBidAsPrime ? "Match" : "Mismatch"} -- {naicsMatch.oppCode}
              </strong>
              <span className="opp-type-badge" style={{ fontSize: 11 }}>
                {naicsMatch.score}/20 pts
              </span>
            </div>
            <p className="caption" style={{ margin: 0, lineHeight: 1.5 }}>{naicsMatch.explanation}</p>
          </div>
        )}

        {/* Observe */}
        <OodaSubSection title="Observe -- What We Know" summary={ooda.observe.summary}>
          {ooda.observe.items.length === 0 ? (
            <EmptyState text="No observations recorded yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ooda.observe.items.map((item, i) => (
                <ObserveCard key={i} item={item} sources={sources} analysisSources={analysisSources} />
              ))}
            </div>
          )}
        </OodaSubSection>

        {/* Orient */}
        <OodaSubSection title="Orient -- What It Means" summary={ooda.orient.summary}>
          {ooda.orient.items.length === 0 ? (
            <EmptyState text="No orientation analysis available yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ooda.orient.items.map((item, i) => (
                <OrientCard key={i} item={item} sources={sources} analysisSources={analysisSources} />
              ))}
            </div>
          )}
        </OodaSubSection>

        {/* Decide */}
        <OodaSubSection title="Decide -- Options & Recommendation" summary={ooda.decide.summary}>
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
        <OodaSubSection title="Act -- Next Steps" summary={ooda.act.summary}>
          {ooda.act.next_steps.length === 0 ? (
            <EmptyState text="No action items defined yet." />
          ) : (
            <table className="opp-act-table">
              <thead>
                <tr>
                  <th className="opp-table-th">Action</th>
                  <th className="opp-table-th">Owner</th>
                  <th className="opp-table-th">Due</th>
                  <th className="opp-table-th">Priority</th>
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
      </>}

      {/* ======================== INTELLIGENCE TAB ======================== */}
      {activeTab === "intelligence" && <>

      {/* Section 5: Pwin Breakdown */}
      {pwin && (
        <Section title={`Pwin Analysis -- ${Math.round((pwin.overall_pwin ?? 0) * 100)}%`}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div className={`opp-analytics-value ${scoreClass(Math.round((pwin.overall_pwin ?? 0) * 100))}`} style={{ fontSize: 28 }}>
                {Math.round((pwin.overall_pwin ?? 0) * 100)}%
              </div>
              <div className="caption">Overall Pwin</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="opp-analytics-value" style={{ fontSize: 28 }}>{Math.round((pwin.historical_win_rate ?? 0) * 100)}%</div>
              <div className="caption">Historical Win Rate</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <span className={`opp-badge confidence-${pwin.confidence}`}>
                {pwin.confidence} confidence
              </span>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="opp-table-th">Factor</th>
                <th className="opp-table-th" style={{ textAlign: "center" }}>Weight</th>
                <th className="opp-table-th" style={{ textAlign: "center" }}>Score</th>
                <th className="opp-table-th" style={{ textAlign: "center" }}>Weighted</th>
                <th className="opp-table-th">Rationale</th>
                <th className="opp-table-th">Source</th>
              </tr>
            </thead>
            <tbody>
              {(pwin.factors ?? []).map((f) => (
                <tr key={f.name}>
                  <td className="opp-table-td" style={{ fontWeight: 600 }}>{f.name}</td>
                  <td className="opp-table-td" style={{ textAlign: "center" }}>{Math.round(f.weight * 100)}%</td>
                  <td className="opp-table-td" style={{ textAlign: "center" }}>
                    <span className={scoreClass(Math.round(f.score * 100))} style={{ fontWeight: 600 }}>
                      {Math.round(f.score * 100)}
                    </span>
                  </td>
                  <td className="opp-table-td" style={{ textAlign: "center", fontWeight: 600 }}>{(f.weighted_score * 100).toFixed(1)}</td>
                  <td className="opp-table-td caption">{f.rationale}</td>
                  <td className="opp-table-td">
                    {pwin.sources && pwin.sources.length > 0 && (
                      <a href={pwin.sources[0].url} target="_blank" rel="noopener noreferrer">
                        <SourceBadge source={pwin.sources[0].kind.replace("_", ".")} hideManual={false} size="sm" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="caption" style={{ marginTop: 8 }}>{pwin.methodology}</div>
        </Section>
      )}

      {/* Section 6: Incumbent Analysis (decision 7) */}
      {incumbent ? (
        <Section title={`Incumbent: ${incumbent.incumbent_name}`}>
          <div className="opp-field-grid">
            <FieldWithSource label="Contract" value={incumbent.contract_number} sources={incumbent.sources ?? analysisSources} />
            <FieldWithSource label="Value" value={formatCurrency(incumbent.contract_value)} sources={incumbent.sources ?? analysisSources} />
            <FieldWithSource label="Period" value={`${formatDate(incumbent.contract_start)} -- ${formatDate(incumbent.contract_end)}`} sources={incumbent.sources ?? analysisSources} />
            <FieldWithSource label="CPARS Rating" value={incumbent.performance_rating ? incumbent.performance_rating.charAt(0).toUpperCase() + incumbent.performance_rating.slice(1) : "\u2014"} sources={incumbent.sources ?? analysisSources} />
            <FieldWithSource label="Recompete Advantage" value={incumbent.recompete_advantage != null ? `+${Math.round(incumbent.recompete_advantage * 100)}%` : "\u2014"} sources={incumbent.sources ?? analysisSources} />
            <FieldWithSource label="Protest Risk" value={incumbent.protest_risk ? incumbent.protest_risk.charAt(0).toUpperCase() + incumbent.protest_risk.slice(1) : "\u2014"} sources={incumbent.sources ?? analysisSources} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <strong className="opp-sub-section-title">Strengths</strong>
              <ul className="opp-bullet-list">{(incumbent.strengths ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <strong className="opp-sub-section-title">Weaknesses</strong>
              <ul className="opp-bullet-list">{(incumbent.weaknesses ?? []).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          </div>
          {(incumbent.key_personnel ?? []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Key Personnel</strong>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                {(incumbent.key_personnel ?? []).map((p) => (
                  <span key={p.name} className="opp-type-badge">
                    {p.name} -- {p.role} ({p.years_on_contract}yr)
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="caption" style={{ marginTop: 12, lineHeight: 1.5 }}>{incumbent.notes}</p>
        </Section>
      ) : (
        <Section title="Incumbent: Unidentified">
          <FieldWithSource label="Incumbent" value="Unidentified" sources={analysisSources} />
          <p className="opp-empty-state">The notice did not disclose the incumbent contractor.</p>
        </Section>
      )}

      {/* Section 7: Competitor Field */}
      {competitors && (
        <Section title={`Competitor Field -- ${competitors.total_expected_bidders ?? 0} Expected Bidders (We're #${competitors.our_position ?? "?"})`}>
          <p className="caption" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>{competitors.market_analysis}</p>
          {(competitors.competitors ?? []).map((c) => (
            <div key={c.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{c.name}</strong>
                  <span className={`opp-badge threat-${c.threat_level}`}>
                    {c.threat_level} threat
                  </span>
                  <span className="caption">{c.size_status?.toUpperCase() ?? ""}</span>
                </div>
                <span style={{ fontWeight: 600 }}>
                  Est. Pwin: {Math.round((c.estimated_pwin ?? 0) * 100)}%
                  {competitors.sources && competitors.sources.length > 0 && (
                    <a href={competitors.sources[0].url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4 }}>
                      <SourceBadge source={competitors.sources[0].kind.replace("_", ".")} hideManual={false} size="sm" />
                    </a>
                  )}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div>+ {(c.strengths ?? []).slice(0, 3).join(" \u00b7 ")}</div>
                <div>- {(c.weaknesses ?? []).slice(0, 2).join(" \u00b7 ")}</div>
              </div>
              {(c.likely_teaming ?? []).length > 0 && (
                <div className="caption" style={{ marginTop: 4 }}>Likely teaming: {(c.likely_teaming ?? []).join(", ")}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Section 8: Black Hat Analysis */}
      {blackHat && (
        <Section title="Black Hat Analysis">
          <div style={{ marginBottom: 12 }}>
            <strong className="opp-sub-section-title">Our Discriminators</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {(blackHat.our_discriminators ?? []).map((d, i) => (
                <span key={i} className="opp-source-chip">
                  {d}
                </span>
              ))}
            </div>
          </div>
          {(blackHat.scenarios ?? []).map((s, i) => (
            <details key={i} className="card" style={{ marginBottom: 8, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>{s.competitor} -- Black Hat Scenario</summary>
              <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                <p><strong>Strategy:</strong> {s.likely_strategy}</p>
                <p><strong>Technical Approach:</strong> {s.technical_approach}</p>
                <p><strong>Pricing:</strong> {s.pricing_strategy}</p>
                <p><strong>Teaming:</strong> {s.teaming_strategy}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                  <div>
                    <strong className="caption">Their Discriminators</strong>
                    <ul className="opp-bullet-list">{(s.discriminators ?? []).map((d, j) => <li key={j}>{d}</li>)}</ul>
                  </div>
                  <div>
                    <strong className="caption">Their Vulnerabilities</strong>
                    <ul className="opp-bullet-list">{(s.vulnerabilities ?? []).map((v, j) => <li key={j}>{v}</li>)}</ul>
                  </div>
                </div>
                <div className="opp-recommend-box" style={{ marginTop: 8 }}>
                  <strong className="caption">Counter Strategy:</strong>
                  <p style={{ margin: "4px 0 0" }}>{s.counter_strategy}</p>
                </div>
              </div>
            </details>
          ))}
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13 }}>Key Takeaways</strong>
            <ul className="opp-bullet-list">{(blackHat.key_takeaways ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </Section>
      )}

      {/* Section 9: Wargame Scenarios */}
      {wargame && (
        <Section title="Wargame Scenarios">
          <div className="opp-recommend-box" style={{ marginBottom: 16 }}>
            <strong>Recommended Strategy:</strong> {wargame.recommended_strategy}
            <div className="caption" style={{ marginTop: 4 }}>Confidence: {Math.round((wargame.confidence ?? 0) * 100)}%</div>
          </div>
          {(wargame.scenarios ?? []).map((s) => (
            <div key={s.id} className={`card risk-${s.risk_level}`} style={{ padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>{s.name}</strong>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="caption">Probability: {Math.round((s.probability ?? 0) * 100)}%</span>
                  <span className={`opp-badge risk-${s.risk_level}`}>
                    {s.risk_level}
                  </span>
                </div>
              </div>
              <p className="caption" style={{ margin: "0 0 8px" }}>{s.description}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><strong>Our Move:</strong><br />{s.our_move}</div>
                <div><strong>Competitor Response:</strong><br />{s.competitor_response}</div>
                <div><strong>Outcome:</strong><br />{s.outcome}</div>
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
        {(sources ?? []).length === 0 && analysisSources.length === 0 ? (
          <EmptyState text="No external sources are associated with this analysis." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="opp-table-th">Title</th>
                <th className="opp-table-th">Type</th>
                <th className="opp-table-th">Publisher</th>
                <th className="opp-table-th">Published</th>
                <th className="opp-table-th">Relevance</th>
              </tr>
            </thead>
            <tbody>
              {(sources ?? []).map((src) => (
                <tr key={src.id} id={`source-${src.id}`}>
                  <td className="opp-table-td">
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer">
                        {src.title}
                      </a>
                    ) : (
                      src.title
                    )}
                  </td>
                  <td className="opp-table-td">
                    <span className="opp-type-badge">{(src.type ?? "").replace(/_/g, " ")}</span>
                  </td>
                  <td className="opp-table-td">{src.publisher ?? "\u2014"}</td>
                  <td className="opp-table-td">{formatDate(src.published_at)}</td>
                  <td className="opp-table-td caption">
                    {src.relevance_reason}
                  </td>
                </tr>
              ))}
              {analysisSources.map((src, i) => (
                <tr key={`analysis-${i}`}>
                  <td className="opp-table-td">
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.title}
                    </a>
                  </td>
                  <td className="opp-table-td">
                    <span className="opp-type-badge">{src.kind.replace(/_/g, " ")}</span>
                  </td>
                  <td className="opp-table-td">{"\u2014"}</td>
                  <td className="opp-table-td">{formatDate(src.retrieved_at)}</td>
                  <td className="opp-table-td caption">Analysis source</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Section 7: Learning & Feedback */}
      <Section title="Learning & Feedback">
        <div className="opp-field-grid">
          <FieldWithSource label="Source Count" value={String(learning.source_count)} sources={analysisSources} />
          <FieldWithSource label="Last Analyzed" value={formatDate((analysis as unknown as Record<string, unknown>).last_analyzed_at as string | null)} sources={analysisSources} />
          <FieldWithSource label="Feedback Submitted" value={learning.feedback_submitted ? "Yes" : "No"} sources={analysisSources} />
          <FieldWithSource label="Next Review" value={formatDate(learning.next_review_at)} sources={analysisSources} />
        </div>
        {(learning?.coverage_gaps ?? []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong className="opp-sub-section-title">Coverage Gaps</strong>
            <ul className="opp-bullet-list">
              {(learning?.coverage_gaps ?? []).map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="caption" style={{ marginTop: 12, padding: "10px 14px" }}>
          Feedback controls will be available in a future sprint.
        </div>
      </Section>

      {/* Section: Capture Coach — AI Strategy Advisor */}
      {coachAnalysis && (
        <Section title="Capture Coach -- AI Strategy">
          <div className="caption" style={{ marginBottom: 12 }}>
            Last generated: {coachAnalysis.generated_at ? new Date(coachAnalysis.generated_at).toLocaleString() : "Unknown"} ({coachAnalysis.model_used ?? "Unknown"})
          </div>

          <div>
            {/* Executive Summary */}
            <div className="opp-recommend-box" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
              <strong>Executive Summary</strong>
              <p style={{ margin: "6px 0 0" }}>{coachAnalysis.executive_summary}</p>
            </div>

            {/* Win Probability */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <div className="opp-analytics-card">
                <div className={`opp-analytics-value ${scoreClass(coachAnalysis.win_probability?.score ?? 0)}`} style={{ fontSize: 28 }}>
                  {coachAnalysis.win_probability?.score ?? 0}%
                </div>
                <div className="caption">Win Probability</div>
                <div className={`caption confidence-${coachAnalysis.win_probability?.confidence ?? "low"}`} style={{ fontWeight: 600, marginTop: 2 }}>
                  {coachAnalysis.win_probability?.confidence ?? "low"} confidence
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 300 }}>
                <strong className="caption">Win Factors</strong>
                <div style={{ marginTop: 6 }}>
                  {(coachAnalysis.win_probability?.factors ?? []).map((f, i) => (
                    <div key={i} className="field-with-source" style={{ fontSize: 13 }}>
                      <span className={`${f.impact === "positive" ? "score-high" : f.impact === "negative" ? "score-low" : ""}`} style={{ fontWeight: 700, minWidth: 14 }}>
                        {f.impact === "positive" ? "+" : f.impact === "negative" ? "-" : "~"}
                      </span>
                      <span><strong>{f.factor}:</strong> {f.detail}</span>
                      {analysisSources.length > 0 && (
                        <a href={analysisSources[0].url} target="_blank" rel="noopener noreferrer">
                          <SourceBadge source={analysisSources[0].kind.replace("_", ".")} hideManual={false} size="sm" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Capture Strategy */}
            <details open className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Capture Strategy</summary>
              <p style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.6 }}>{coachAnalysis.capture_strategy?.approach ?? ""}</p>
              {(coachAnalysis.capture_strategy?.win_themes ?? []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong className="caption">Win Themes</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {(coachAnalysis.capture_strategy?.win_themes ?? []).map((t, i) => (
                      <span key={i} className="opp-source-chip">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {(coachAnalysis.capture_strategy?.discriminators ?? []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong className="caption">Discriminators</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {(coachAnalysis.capture_strategy?.discriminators ?? []).map((d, i) => (
                      <span key={i} className="opp-type-badge">{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {(coachAnalysis.capture_strategy?.teaming_recommendations ?? []).length > 0 && (
                <div>
                  <strong className="caption">Teaming Recommendations</strong>
                  {(coachAnalysis.capture_strategy?.teaming_recommendations ?? []).map((t, i) => (
                    <div key={i} className="field-with-source" style={{ fontSize: 13 }}>
                      <strong>{t.partner_type}:</strong> {t.rationale}
                    </div>
                  ))}
                </div>
              )}
            </details>

            {/* Gap Analysis */}
            {(coachAnalysis.gap_analysis ?? []).length > 0 && (
              <details open className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Gap Analysis ({(coachAnalysis.gap_analysis ?? []).length})</summary>
                <div style={{ marginTop: 8 }}>
                  {(coachAnalysis.gap_analysis ?? []).map((g, i) => (
                    <div key={i} className="field-with-source" style={{ fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1 }}>
                        <strong>{g.gap}</strong>
                        <span className={`opp-badge severity-${g.severity}`}>
                          {g.severity}
                        </span>
                      </div>
                      <div className="caption" style={{ marginTop: 4 }}>{g.mitigation}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Risk Assessment */}
            {(coachAnalysis.risk_assessment ?? []).length > 0 && (
              <details open className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Risk Assessment ({(coachAnalysis.risk_assessment ?? []).length})</summary>
                <div style={{ marginTop: 8 }}>
                  {(coachAnalysis.risk_assessment ?? []).map((r, i) => (
                    <div key={i} className="field-with-source" style={{ fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1 }}>
                        <strong>{r.risk}</strong>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span className="caption">L: {r.likelihood}</span>
                          <span className="caption">I: {r.impact}</span>
                        </div>
                      </div>
                      <div className="caption" style={{ marginTop: 4 }}>{r.mitigation}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Next Actions */}
            {(coachAnalysis.next_actions ?? []).length > 0 && (
              <details open className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Next Actions ({(coachAnalysis.next_actions ?? []).length})</summary>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th className="opp-table-th">Action</th>
                      <th className="opp-table-th">Priority</th>
                      <th className="opp-table-th">Owner</th>
                      <th className="opp-table-th">Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(coachAnalysis.next_actions ?? []).map((a, i) => (
                      <tr key={i}>
                        <td className="opp-table-td">{a.action}</td>
                        <td className="opp-table-td">
                          <span className={`opp-badge severity-${a.priority}`}>
                            {a.priority}
                          </span>
                        </td>
                        <td className="opp-table-td caption">{a.owner}</td>
                        <td className="opp-table-td caption">{a.timeline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        </Section>
      )}
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
              <div key={ev.id} className="card" style={{ display: "flex", gap: 12, padding: "10px 14px" }}>
                <div className={`timeline-dot ${ev.type === "create" ? "dot-create" : "dot-update"}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.summary}</div>
                  <div className="caption" style={{ marginTop: 2 }}>{formatDate(ev.timestamp)} &middot; {ev.actor}</div>
                </div>
                <div className="caption" style={{ textTransform: "uppercase" }}>{ev.type}</div>
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
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
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
    <div className="opp-section">
      <h2 className="opp-section-title">{title}</h2>
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
      <h3 className="opp-sub-section-title">{title}</h3>
      {summary && <p className="caption" style={{ margin: "0 0 10px" }}>{summary}</p>}
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="opp-empty-state">{text}</p>;
}

function SourceChip({ sourceId, sources, analysisSources }: { sourceId: string; sources: OpportunitySourceRow[]; analysisSources?: SourceRef[] }) {
  const src = sources.find((s) => s.id === sourceId);
  if (!src) {
    // Show a generic badge from analysis sources
    if (analysisSources && analysisSources.length > 0) {
      return (
        <a href={analysisSources[0].url} target="_blank" rel="noopener noreferrer" className="opp-source-chip">
          {analysisSources[0].kind.replace(/_/g, " ")}
        </a>
      );
    }
    return null;
  }
  return (
    <span
      className="opp-source-chip"
      title={`${src.title} -- see Strategy tab for details`}
    >
      {src.type.replace(/_/g, " ")}
    </span>
  );
}

function ObserveCard({ item, sources, analysisSources }: { item: OodaObserveItem; sources: OpportunitySourceRow[]; analysisSources: SourceRef[] }) {
  return (
    <div className="opp-ooda-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{item.label}</strong>
        <div style={{ display: "flex", gap: 4 }}>
          {item.source_ids.map((sid) => (
            <SourceChip key={sid} sourceId={sid} sources={sources} analysisSources={analysisSources} />
          ))}
          {item.source_ids.length === 0 && analysisSources.length > 0 && (
            <a href={analysisSources[0].url} target="_blank" rel="noopener noreferrer">
              <SourceBadge source={analysisSources[0].kind.replace("_", ".")} hideManual={false} size="sm" />
            </a>
          )}
        </div>
      </div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{item.value}</div>
    </div>
  );
}

function OrientCard({ item, sources, analysisSources }: { item: OodaOrientItem; sources: OpportunitySourceRow[]; analysisSources: SourceRef[] }) {
  return (
    <div className="opp-ooda-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{item.label}</strong>
          <span className={`opp-type-badge ${orientTypeClass(item.type)}`}>
            {item.type}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {item.source_ids.map((sid) => (
            <SourceChip key={sid} sourceId={sid} sources={sources} analysisSources={analysisSources} />
          ))}
          {item.source_ids.length === 0 && analysisSources.length > 0 && (
            <a href={analysisSources[0].url} target="_blank" rel="noopener noreferrer">
              <SourceBadge source={analysisSources[0].kind.replace("_", ".")} hideManual={false} size="sm" />
            </a>
          )}
        </div>
      </div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{item.value}</div>
    </div>
  );
}

function DecideCard({ option }: { option: OodaDecideOption }) {
  return (
    <div className={`opp-ooda-card ${option.recommended ? "decide-recommended" : "decide-default"}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{option.label}</strong>
        {option.recommended && (
          <span className="opp-type-badge decide-recommended-tag">
            Recommended
          </span>
        )}
      </div>
      <div className="caption" style={{ fontSize: 14, marginTop: 4 }}>{option.rationale}</div>
    </div>
  );
}

function ActRow({ step }: { step: OodaActStep }) {
  return (
    <tr>
      <td className="opp-table-td">
        <div><Linkify text={step.action} /></div>
        {step.resource_url && (
          <a
            href={step.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            className="caption"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}
          >
            View Resource &rarr;
          </a>
        )}
      </td>
      <td className="opp-table-td">{step.owner ?? "\u2014"}</td>
      <td className="opp-table-td">{formatDate(step.due_date)}</td>
      <td className="opp-table-td">
        <span className={`caption ${priorityClass(step.priority)}`} style={{ fontWeight: 600, textTransform: "uppercase" }}>
          {step.priority}
        </span>
      </td>
    </tr>
  );
}
