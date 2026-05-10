import { useEffect, useState } from "react";
import {
  fetchFastTrackSummary,
  fetchFastTrackMatches,
  fetchFastTrackDetail,
  type FastTrackSummaryData,
  type FastTrackMatch,
  type FastTrackDetailData,
} from "../api/client";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  reviewing: "#f59e0b",
  watching: "#8b5cf6",
  promoted: "#22c55e",
  discarded: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  watching: "Watching",
  promoted: "Promoted",
  discarded: "Discarded",
};

const ROLE_COLORS: Record<string, string> = {
  internal: "#22c55e",
  partner: "#3b82f6",
  target: "#8b5cf6",
  competitor: "#ef4444",
  unknown: "#6b7280",
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  innovation_factory: "Innovation Factory",
  academia: "Academia",
  pre_rfi: "Pre-RFI",
  post_rfi: "Post-RFI",
  sbir: "SBIR",
  funding_event: "Funding Event",
  competitor_move: "Competitor Move",
};

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (86400 * 1000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

// ---------------------------------------------------------------------------
// Badge component
// ---------------------------------------------------------------------------
function Badge({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 10,
        color,
        background: bg ?? `${color}18`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary strip item
// ---------------------------------------------------------------------------
function SummaryStat({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        textAlign: "center",
        padding: "12px 16px",
        background: active ? `${color ?? "var(--color-primary)"}15` : "var(--color-surface)",
        border: `1px solid ${active ? color ?? "var(--color-primary)" : "var(--color-border)"}`,
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
        minWidth: 90,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function FastTrack() {
  const [summary, setSummary] = useState<FastTrackSummaryData | null>(null);
  const [matches, setMatches] = useState<FastTrackMatch[]>([]);
  const [detail, setDetail] = useState<FastTrackDetailData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [signalTypeFilter, setSignalTypeFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Load summary + matches
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchFastTrackSummary(), fetchFastTrackMatches()])
      .then(([sumEnv, matchEnv]) => {
        if (sumEnv.success && sumEnv.data) setSummary(sumEnv.data);
        if (matchEnv.success && matchEnv.data) {
          setMatches(matchEnv.data.matches);
          if (matchEnv.data.matches.length > 0 && !selectedId) {
            setSelectedId(matchEnv.data.matches[0].id);
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload matches when filters change
  useEffect(() => {
    fetchFastTrackMatches({
      status: statusFilter || undefined,
      signal_type: signalTypeFilter || undefined,
      company_role: roleFilter || undefined,
      search: searchQuery || undefined,
    })
      .then((env) => {
        if (env.success && env.data) {
          setMatches(env.data.matches);
        }
      })
      .catch(() => {});
  }, [statusFilter, signalTypeFilter, roleFilter, searchQuery]);

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setDetailLoading(true);
    fetchFastTrackDetail(selectedId)
      .then((env) => {
        if (env.success && env.data) setDetail(env.data);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ margin: "0 0 8px" }}>Fast Track</h2>
        <p style={{ color: "var(--color-text-muted)" }}>Loading match candidates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ margin: "0 0 8px" }}>Fast Track</h2>
        <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, color: "#b91c1c" }}>
          {error}
        </div>
      </div>
    );
  }

  const hasFilters = statusFilter || signalTypeFilter || roleFilter || searchQuery;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Fast Track</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
            Emerging signals → technology → company → contract-path matching
          </p>
        </div>
        <Badge label="read-only" color="#6b7280" bg="#f3f4f6" />
      </div>

      {/* Summary strip */}
      {summary && (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <SummaryStat
            label="New"
            value={summary.new_count}
            color="#3b82f6"
            active={statusFilter === "new"}
            onClick={() => setStatusFilter(statusFilter === "new" ? "" : "new")}
          />
          <SummaryStat
            label="Reviewing"
            value={summary.reviewing_count}
            color="#f59e0b"
            active={statusFilter === "reviewing"}
            onClick={() => setStatusFilter(statusFilter === "reviewing" ? "" : "reviewing")}
          />
          <SummaryStat
            label="Watching"
            value={summary.watching_count}
            color="#8b5cf6"
            active={statusFilter === "watching"}
            onClick={() => setStatusFilter(statusFilter === "watching" ? "" : "watching")}
          />
          <SummaryStat
            label="Promoted"
            value={summary.promoted_count}
            color="#22c55e"
            active={statusFilter === "promoted"}
            onClick={() => setStatusFilter(statusFilter === "promoted" ? "" : "promoted")}
          />
          <SummaryStat
            label="Discarded"
            value={summary.discarded_count}
            color="#6b7280"
            active={statusFilter === "discarded"}
            onClick={() => setStatusFilter(statusFilter === "discarded" ? "" : "discarded")}
          />
          <SummaryStat label="Needs Attention" value={summary.needs_attention_count} color="#ef4444" />
          <SummaryStat label="Total" value={summary.total_count} />
        </div>
      )}

      {/* Filters row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search signals, tech, companies, agencies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "8px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        />
        <select
          value={signalTypeFilter}
          onChange={(e) => setSignalTypeFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Signal Types</option>
          {Object.entries(SIGNAL_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Roles</option>
          <option value="internal">Internal</option>
          <option value="partner">Partner</option>
          <option value="target">Target</option>
          <option value="competitor">Competitor</option>
          <option value="unknown">Unknown</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setStatusFilter("");
              setSignalTypeFilter("");
              setRoleFilter("");
              setSearchQuery("");
            }}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              color: "var(--color-text-muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Split view: List + Detail */}
      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 16, minHeight: 500 }}>
        {/* Match list */}
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-surface)",
            overflow: "auto",
            maxHeight: "calc(100vh - 320px)",
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
              No matches found
            </div>
          ) : (
            matches.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  background: selectedId === m.id ? "rgba(59,130,246,0.08)" : "transparent",
                  borderLeft: selectedId === m.id ? "3px solid var(--color-primary)" : "3px solid transparent",
                  transition: "background 0.1s",
                }}
              >
                {/* Top: Score + Status + Signal Type */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: scoreColor(m.match_score),
                      minWidth: 28,
                    }}
                  >
                    {m.match_score}
                  </span>
                  <Badge label={STATUS_LABELS[m.status] ?? m.status} color={STATUS_COLORS[m.status] ?? "#6b7280"} />
                  <Badge label={SIGNAL_TYPE_LABELS[m.signal_type] ?? m.signal_type} color="#6b7280" />
                </div>

                {/* Technology */}
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{m.technology}</div>

                {/* Company + Role */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.company_name}</span>
                  <Badge label={m.company_role} color={ROLE_COLORS[m.company_role] ?? "#6b7280"} />
                </div>

                {/* Agency + Created */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-muted)" }}>
                  <span>{m.candidate_agency ?? "—"}</span>
                  <span>{relativeTime(m.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-surface)",
            overflow: "auto",
            maxHeight: "calc(100vh - 320px)",
            padding: 20,
          }}
        >
          {detailLoading ? (
            <p style={{ color: "var(--color-text-muted)" }}>Loading detail...</p>
          ) : !detail ? (
            <p style={{ color: "var(--color-text-muted)" }}>Select a match to view details</p>
          ) : (
            <DetailPanel data={detail} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel sub-component
// ---------------------------------------------------------------------------
function DetailPanel({ data }: { data: FastTrackDetailData }) {
  const { match: m, analysis, ooda, sources, learning } = data;
  const [activeTab, setActiveTab] = useState<"overview" | "ooda" | "sources">("overview");

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "ooda" as const, label: "OODA" },
    { key: "sources" as const, label: `Sources (${sources.length})` },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: scoreColor(m.match_score) }}>{m.match_score}</span>
            <Badge label={STATUS_LABELS[m.status] ?? m.status} color={STATUS_COLORS[m.status] ?? "#6b7280"} />
            <Badge label={m.safety_lane} color="#6b7280" bg="#f3f4f6" />
            {m.promotion_target && (
              <Badge label={`→ ${m.promotion_target}`} color="#22c55e" />
            )}
          </div>
          <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{m.technology}</h3>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
            {m.company_name}
            {m.company_url && (
              <a href={m.company_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, fontSize: 11, color: "var(--color-primary)" }}>
                ↗
              </a>
            )}
            <span style={{ margin: "0 6px" }}>•</span>
            <Badge label={m.company_role} color={ROLE_COLORS[m.company_role] ?? "#6b7280"} />
            <span style={{ margin: "0 6px" }}>•</span>
            {m.candidate_agency ?? "No agency"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "right" }}>
          <div>Created {relativeTime(m.created_at)}</div>
          <div>Updated {relativeTime(m.updated_at)}</div>
          {m.next_review_at && (
            <div style={{ color: "#f59e0b" }}>Review: {new Date(m.next_review_at).toLocaleDateString()}</div>
          )}
        </div>
      </div>

      {/* Signal summary */}
      <div style={{
        padding: 12,
        background: "rgba(59,130,246,0.06)",
        borderRadius: 8,
        marginBottom: 12,
        borderLeft: "3px solid var(--color-primary)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-primary)", marginBottom: 4, textTransform: "uppercase" }}>
          Signal — {SIGNAL_TYPE_LABELS[m.signal_type] ?? m.signal_type}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{m.signal_summary}</div>
      </div>

      {/* Tech tags */}
      {m.technology_tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {m.technology_tags.map((t) => (
            <Badge key={t} label={t} color="#6b7280" />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)", marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "transparent",
              color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab match={m} analysis={analysis} learning={learning} />
      )}
      {activeTab === "ooda" && <OODATab ooda={ooda} />}
      {activeTab === "sources" && <SourcesTab sources={sources} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
function OverviewTab({
  match: m,
  analysis,
  learning,
}: {
  match: FastTrackDetailData["match"];
  analysis: FastTrackDetailData["analysis"];
  learning: FastTrackDetailData["learning"];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Executive summary */}
      {analysis && (
        <Section title="Executive Summary">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{analysis.executive_summary}</p>
        </Section>
      )}

      {/* Why it matters */}
      {analysis && (
        <Section title="Why It Matters">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{analysis.why_it_matters}</p>
        </Section>
      )}

      {/* Contract path hypothesis */}
      <Section title="Contract Path Hypothesis">
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{m.contract_path_hypothesis}</p>
      </Section>

      {/* Candidate requirement */}
      {m.candidate_requirement && (
        <Section title="Candidate Requirement">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{m.candidate_requirement}</p>
        </Section>
      )}

      {/* Buyer problem */}
      {m.buyer_problem && (
        <Section title="Buyer Problem">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{m.buyer_problem}</p>
        </Section>
      )}

      {/* Incumbent/competitor context */}
      {m.incumbent_or_competitor_context && (
        <Section title="Competitive Context">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{m.incumbent_or_competitor_context}</p>
        </Section>
      )}

      {/* Risks / Gaps */}
      {analysis && analysis.risks_or_gaps.length > 0 && (
        <Section title="Risks & Gaps">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {analysis.risks_or_gaps.map((r, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4 }}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Recommended next action */}
      <Section title="Recommended Next Action">
        <div style={{
          padding: 12,
          background: "rgba(34,197,94,0.08)",
          borderRadius: 8,
          borderLeft: "3px solid #22c55e",
          fontSize: 13,
          lineHeight: 1.5,
          fontWeight: 500,
        }}>
          {m.recommended_next_action}
        </div>
      </Section>

      {/* Learning notes */}
      {learning && learning.notes.length > 0 && (
        <Section title="Learning Notes">
          {learning.notes.map((n, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              {n}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OODA tab
// ---------------------------------------------------------------------------
function OODATab({ ooda }: { ooda: FastTrackDetailData["ooda"] }) {
  if (!ooda) {
    return <p style={{ color: "var(--color-text-muted)" }}>No OODA analysis available</p>;
  }

  const sections = [
    { title: "Observe", icon: "👁", color: "#3b82f6", items: ooda.observe, type: "list" as const },
    { title: "Orient", icon: "🧭", color: "#f59e0b", items: ooda.orient, type: "list" as const },
    { title: "Decide", icon: "⚖", color: "#8b5cf6", items: [ooda.decide], type: "text" as const },
    { title: "Act", icon: "🎯", color: "#22c55e", items: [ooda.act], type: "text" as const },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sections.map((s) => (
        <div
          key={s.title}
          style={{
            padding: 14,
            background: `${s.color}08`,
            borderRadius: 8,
            borderLeft: `3px solid ${s.color}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.title}</span>
          </div>
          {s.type === "list" ? (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {s.items.map((item, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{s.items[0]}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources tab
// ---------------------------------------------------------------------------
function SourcesTab({ sources }: { sources: FastTrackDetailData["sources"] }) {
  if (sources.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-muted)" }}>
        No sources attached to this match candidate.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {sources.map((src) => (
        <div
          key={src.source_id}
          style={{
            padding: 14,
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Badge label={src.type.replace(/_/g, " ")} color="#6b7280" />
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{src.publisher}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {src.url ? (
              <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", textDecoration: "none" }}>
                {src.title} ↗
              </a>
            ) : (
              src.title
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
            Published: {new Date(src.published_at).toLocaleDateString()} • Retrieved: {new Date(src.retrieved_at).toLocaleDateString()}
          </div>
          <div style={{
            fontSize: 12,
            padding: 8,
            background: "rgba(59,130,246,0.06)",
            borderRadius: 6,
            borderLeft: "2px solid var(--color-primary)",
          }}>
            <strong>Supports:</strong> {src.claim_support}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
