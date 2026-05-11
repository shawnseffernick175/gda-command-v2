import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import AskAIChat from "../components/AskAIChat";
import {
  fetchOpportunityDetail,
  fetchPwinBreakdown,
  fetchIncumbentAnalysis,
  fetchCompetitorField,
  fetchBlackHatAnalysis,
  fetchWargameAnalysis,
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
} from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  discovery: "#6b7280",
  qualified: "#3b82f6",
  pipeline: "#22c55e",
  lost: "#ef4444",
  won: "#eab308",
};

function formatCurrency(n: number | null): string {
  if (n === null) return "—";
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

    // Fetch enrichments in parallel (non-blocking)
    fetchPwinBreakdown(id).then((e) => { if (e.success && e.data) setPwin(e.data); }).catch(() => {});
    fetchIncumbentAnalysis(id).then((e) => { if (e.success && e.data) setIncumbent(e.data); }).catch(() => {});
    fetchCompetitorField(id).then((e) => { if (e.success && e.data) setCompetitors(e.data); }).catch(() => {});
    fetchBlackHatAnalysis(id).then((e) => { if (e.success && e.data) setBlackHat(e.data); }).catch(() => {});
    fetchWargameAnalysis(id).then((e) => { if (e.success && e.data) setWargame(e.data); }).catch(() => {});
  }, [id]);

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

  const { opportunity: opp, analysis, ooda, sources, learning } = data;

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{opp.title}</h1>
        <span
          style={{
            ...styles.badge,
            background: STATUS_COLORS[opp.status] ?? "#6b7280",
          }}
        >
          {opp.status.charAt(0).toUpperCase() + opp.status.slice(1)}
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(opp.score) }}>
          {opp.score}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>
        <span style={{ ...styles.sourceBadge, background: data.source === "db" ? "#166534" : "#1e3a5f" }}>
          {data.source === "db" ? "Live DB" : "Mock data"}
        </span>
        {opp.id}
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
          <Field label="Probability of Win" value={opp.probability_of_win !== null ? `${Math.round(opp.probability_of_win * 100)}%` : "—"} />
          <Field label="Due Date" value={formatDate(opp.due_date)} />
          <Field label="Set-Aside" value={opp.set_aside} />
          <Field label="Place of Performance" value={opp.place_of_performance} />
          <Field label="Incumbent" value={opp.incumbent} />
          <Field label="Tags" value={opp.tags.length > 0 ? opp.tags.join(", ") : "—"} />
        </div>
      </Section>

      {/* Section 2: Executive Summary */}
      <Section title="Executive Summary">
        <p style={{ margin: 0, lineHeight: 1.6 }}>{analysis.executive_summary}</p>
        {analysis.recommended_action && (
          <div style={styles.recommendBox}>
            <strong style={{ fontSize: 13, color: "#22c55e" }}>Recommended Action</strong>
            <p style={{ margin: "4px 0 0" }}>{analysis.recommended_action}</p>
          </div>
        )}
      </Section>

      {/* Section 3: OODA Analysis */}
      <Section title="OODA Analysis">
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

      {/* Section 5: Pwin Breakdown */}
      {pwin && (
        <Section title={`Pwin Analysis — ${Math.round(pwin.overall_pwin * 100)}%`}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: pwin.overall_pwin >= 0.6 ? "#22c55e" : pwin.overall_pwin >= 0.4 ? "#f59e0b" : "#ef4444" }}>
                {Math.round(pwin.overall_pwin * 100)}%
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Overall Pwin</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#6b7280" }}>{Math.round(pwin.historical_win_rate * 100)}%</div>
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
              {pwin.factors.map((f) => (
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
            <Field label="CPARS Rating" value={incumbent.performance_rating.charAt(0).toUpperCase() + incumbent.performance_rating.slice(1)} />
            <Field label="Recompete Advantage" value={`+${Math.round(incumbent.recompete_advantage * 100)}%`} />
            <Field label="Protest Risk" value={incumbent.protest_risk.charAt(0).toUpperCase() + incumbent.protest_risk.slice(1)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <strong style={{ fontSize: 13, color: "#22c55e" }}>Strengths</strong>
              <ul style={styles.bulletList}>{incumbent.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <strong style={{ fontSize: 13, color: "#ef4444" }}>Weaknesses</strong>
              <ul style={styles.bulletList}>{incumbent.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          </div>
          {incumbent.key_personnel.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Key Personnel</strong>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                {incumbent.key_personnel.map((p) => (
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
        <Section title={`Competitor Field — ${competitors.total_expected_bidders} Expected Bidders (We're #${competitors.our_position})`}>
          <p style={{ margin: "0 0 12px", lineHeight: 1.6, fontSize: 13, color: "#9ca3af" }}>{competitors.market_analysis}</p>
          {competitors.competitors.map((c) => (
            <div key={c.id} style={{ padding: 12, marginBottom: 8, background: "rgba(107,114,128,0.05)", borderRadius: 6, border: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{c.name}</strong>
                  <span style={{ ...styles.badge, background: c.threat_level === "high" ? "#991b1b" : c.threat_level === "medium" ? "#92400e" : "#166534" }}>
                    {c.threat_level} threat
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{c.size_status.toUpperCase()}</span>
                </div>
                <span style={{ fontWeight: 600, color: c.estimated_pwin >= 0.3 ? "#ef4444" : "#f59e0b" }}>
                  Est. Pwin: {Math.round(c.estimated_pwin * 100)}%
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><span style={{ color: "#22c55e" }}>+</span> {c.strengths.slice(0, 3).join(" · ")}</div>
                <div><span style={{ color: "#ef4444" }}>−</span> {c.weaknesses.slice(0, 2).join(" · ")}</div>
              </div>
              {c.likely_teaming.length > 0 && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Likely teaming: {c.likely_teaming.join(", ")}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Section 8: Black Hat Analysis */}
      {blackHat && (
        <Section title="Black Hat Analysis">
          <div style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 13, color: "#3b82f6" }}>Our Discriminators</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {blackHat.our_discriminators.map((d, i) => (
                <span key={i} style={{ padding: "4px 10px", background: "rgba(59,130,246,0.1)", borderRadius: 12, fontSize: 12, color: "#60a5fa" }}>
                  {d}
                </span>
              ))}
            </div>
          </div>
          {blackHat.scenarios.map((s, i) => (
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
                    <ul style={styles.bulletList}>{s.discriminators.map((d, j) => <li key={j}>{d}</li>)}</ul>
                  </div>
                  <div>
                    <strong style={{ color: "#22c55e", fontSize: 12 }}>Their Vulnerabilities</strong>
                    <ul style={styles.bulletList}>{s.vulnerabilities.map((v, j) => <li key={j}>{v}</li>)}</ul>
                  </div>
                </div>
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(59,130,246,0.08)", borderRadius: 6 }}>
                  <strong style={{ fontSize: 12, color: "#3b82f6" }}>Counter Strategy:</strong>
                  <p style={{ margin: "4px 0 0" }}>{s.counter_strategy}</p>
                </div>
              </div>
            </details>
          ))}
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13 }}>Key Takeaways</strong>
            <ul style={styles.bulletList}>{blackHat.key_takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </Section>
      )}

      {/* Section 9: Wargame Scenarios */}
      {wargame && (
        <Section title="Wargame Scenarios">
          <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.08)", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            <strong>Recommended Strategy:</strong> {wargame.recommended_strategy}
            <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>Confidence: {Math.round(wargame.confidence * 100)}%</div>
          </div>
          {wargame.scenarios.map((s) => (
            <div key={s.id} style={{ padding: 12, marginBottom: 8, border: "1px solid var(--color-border)", borderRadius: 6, borderLeft: `3px solid ${s.risk_level === "high" ? "#ef4444" : s.risk_level === "medium" ? "#f59e0b" : "#22c55e"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>{s.name}</strong>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Probability: {Math.round(s.probability * 100)}%</span>
                  <span style={{ ...styles.badge, background: s.risk_level === "high" ? "#991b1b" : s.risk_level === "medium" ? "#92400e" : "#166534" }}>
                    {s.risk_level}
                  </span>
                </div>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#d1d5db" }}>{s.description}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><strong style={{ color: "#3b82f6" }}>Our Move:</strong><br />{s.our_move}</div>
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
          <p style={{ margin: 0, lineHeight: 1.6 }}>{analysis.competitive_landscape}</p>
        ) : (
          <EmptyState text="No competitive intelligence available for this opportunity." />
        )}
      </Section>

      {/* Section 11: Sources */}
      <Section title="Sources">
        {sources.length === 0 ? (
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
              {sources.map((src) => (
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
                    <span style={{ ...styles.typeBadge }}>{src.type.replace(/_/g, " ")}</span>
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
        {learning.coverage_gaps.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13, color: "#f59e0b" }}>Coverage Gaps</strong>
            <ul style={styles.bulletList}>
              {learning.coverage_gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(107,114,128,0.1)", borderRadius: 6, fontSize: 13, color: "#9ca3af" }}>
          Feedback controls will be available in a future sprint.
        </div>
      </Section>

      {/* Section 8: Ask AI */}
      <div style={{ marginTop: 24 }}>
        <AskAIChat opportunityId={id ?? ""} opportunityTitle={opp.title} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      title={src.title}
      onClick={() => {
        const el = document.getElementById(`source-${sourceId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
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
      <td style={styles.actTd}>{step.action}</td>
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
};
