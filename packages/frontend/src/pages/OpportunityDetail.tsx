import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchOpportunityDetail,
  type OpportunityDetailData,
  type OodaObserveItem,
  type OodaOrientItem,
  type OodaDecideOption,
  type OodaActStep,
  type OpportunitySourceRow,
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

  const backPath = location.state?.from ?? "/ops-tracker";
  const backLabel = backPath === "/pipeline" ? "Pipeline" : "Ops Tracker";

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

      {/* Section 5: Competitive Landscape */}
      <Section title="Competitive Landscape">
        {analysis.competitive_landscape ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>{analysis.competitive_landscape}</p>
        ) : (
          <EmptyState text="No competitive intelligence available for this opportunity." />
        )}
      </Section>

      {/* Section 6: Sources */}
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
