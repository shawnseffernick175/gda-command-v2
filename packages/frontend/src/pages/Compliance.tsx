import { useEffect, useState } from "react";
import ExportButton from "../components/ExportButton";
import {
  fetchComplianceRequirements,
  fetchClauseLibrary,
  type ComplianceRequirementsData,
  type ComplianceRequirementRow,
  type ClauseLibraryData,
  type ClauseReferenceRow,
} from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  compliant: "#22c55e",
  partial: "#f59e0b",
  gap: "#ef4444",
  not_applicable: "#6b7280",
};

const STATUS_ICONS: Record<string, string> = {
  compliant: "\u2713",
  partial: "\u25D1",
  gap: "\u2717",
  not_applicable: "\u2014",
};

const STATUS_LABELS: Record<string, string> = {
  compliant: "Compliant",
  partial: "Partial",
  gap: "Gap",
  not_applicable: "N/A",
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  management: "Management",
  past_performance: "Past Performance",
  cost_price: "Cost/Price",
  certifications: "Certifications",
  security: "Security",
  small_business: "Small Business",
  other: "Other",
};

const CLAUSE_TYPE_LABELS: Record<string, string> = {
  far: "FAR",
  dfars: "DFARS",
  agency: "Agency",
  custom: "Custom",
};

const CLAUSE_TYPE_COLORS: Record<string, string> = {
  far: "#3b82f6",
  dfars: "#8b5cf6",
  agency: "#f59e0b",
  custom: "#6b7280",
};

type TabKey = "requirements" | "clauses";

export default function Compliance() {
  const [tab, setTab] = useState<TabKey>("requirements");
  const [reqData, setReqData] = useState<ComplianceRequirementsData | null>(null);
  const [clauseData, setClauseData] = useState<ClauseLibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [solicitationFilter, setSolicitationFilter] = useState("");
  const [clauseTypeFilter, setClauseTypeFilter] = useState("");
  const [clauseSearch, setClauseSearch] = useState("");
  const [expandedClause, setExpandedClause] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchComplianceRequirements(), fetchClauseLibrary()])
      .then(([reqEnv, clauseEnv]) => {
        if (reqEnv.success && reqEnv.data) setReqData(reqEnv.data);
        else setError(reqEnv.error?.message ?? "Failed to load requirements");
        if (clauseEnv.success && clauseEnv.data) setClauseData(clauseEnv.data);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading compliance data...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;
  if (!reqData) return null;

  const source = tab === "requirements" ? reqData.source : (clauseData?.source ?? "db");

  // Filter requirements
  let requirements = reqData.requirements;
  if (search) {
    const q = search.toLowerCase();
    requirements = requirements.filter(
      (r) =>
        r.requirement.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q) ||
        r.solicitation_title.toLowerCase().includes(q) ||
        (r.evidence && r.evidence.toLowerCase().includes(q)),
    );
  }
  if (statusFilter) requirements = requirements.filter((r) => r.status === statusFilter);
  if (categoryFilter) requirements = requirements.filter((r) => r.category === categoryFilter);
  if (solicitationFilter) requirements = requirements.filter((r) => r.solicitation_id === solicitationFilter);

  // Filter clauses
  let clauses = clauseData?.clauses ?? [];
  if (clauseSearch) {
    const q = clauseSearch.toLowerCase();
    clauses = clauses.filter(
      (c) =>
        c.clause_number.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q),
    );
  }
  if (clauseTypeFilter) clauses = clauses.filter((c) => c.type === clauseTypeFilter);

  const { summary } = reqData;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Compliance Matrix</h1>
        <ExportButton endpoint="compliance" label="Export CSV" />
      </div>
      <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 8 }}>
        Track solicitation requirements, assess compliance status, and browse the clause library.
      </p>

      <span
        style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 4,
          background: "rgba(34,197,94,0.15)",
          color: "#22c55e",
          marginBottom: 16,
        }}
      >
        {source === "n8n" ? "Live \u2014 n8n" : "Live \u2014 database"}
      </span>

      {/* Summary strip */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Compliant", value: summary.compliant, color: "#22c55e" },
          { label: "Partial", value: summary.partial, color: "#f59e0b" },
          { label: "Gap", value: summary.gap, color: "#ef4444" },
          { label: "N/A", value: summary.not_applicable, color: "#6b7280" },
          { label: "Score", value: `${summary.score}%`, color: summary.score >= 80 ? "#22c55e" : summary.score >= 60 ? "#f59e0b" : "#ef4444" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "12px 20px",
              textAlign: "center",
              minWidth: 100,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
        {(["requirements", "clauses"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
              background: tab === t ? "rgba(59,130,246,0.1)" : "transparent",
              fontSize: 13,
            }}
          >
            {t === "requirements" ? `Requirements (${reqData.total})` : `Clause Library (${clauseData?.total ?? 0})`}
          </button>
        ))}
      </div>

      {tab === "requirements" ? (
        <RequirementsTab
          requirements={requirements}
          solicitations={reqData.solicitations}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          solicitationFilter={solicitationFilter}
          setSolicitationFilter={setSolicitationFilter}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      ) : (
        <ClausesTab
          clauses={clauses}
          typeCounts={clauseData?.typeCounts ?? {}}
          clauseSearch={clauseSearch}
          setClauseSearch={setClauseSearch}
          clauseTypeFilter={clauseTypeFilter}
          setClauseTypeFilter={setClauseTypeFilter}
          expandedClause={expandedClause}
          setExpandedClause={setExpandedClause}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirements Tab
// ---------------------------------------------------------------------------

function RequirementsTab({
  requirements,
  solicitations,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  solicitationFilter,
  setSolicitationFilter,
  expanded,
  setExpanded,
}: {
  requirements: ComplianceRequirementRow[];
  solicitations: Array<{ id: string; title: string }>;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  solicitationFilter: string;
  setSolicitationFilter: (v: string) => void;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  return (
    <>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Search requirements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            minWidth: 200,
          }}
        />
        <select
          value={solicitationFilter}
          onChange={(e) => setSolicitationFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Solicitations</option>
          {solicitations.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(search || statusFilter || categoryFilter || solicitationFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); setCategoryFilter(""); setSolicitationFilter(""); }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginBottom: 12 }}>
        Showing {requirements.length} requirement{requirements.length !== 1 ? "s" : ""}
      </p>

      {/* Requirements list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {requirements.map((req) => {
          const isExpanded = expanded === req.id;
          return (
            <div
              key={req.id}
              style={{
                background: "var(--color-surface)",
                border: `1px solid ${isExpanded ? STATUS_COLORS[req.status] ?? "var(--color-border)" : "var(--color-border)"}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Header row */}
              <div
                onClick={() => setExpanded(isExpanded ? null : req.id)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "40px 80px 1fr 120px 140px 40px",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {/* Status icon */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: `${STATUS_COLORS[req.status]}20`,
                    color: STATUS_COLORS[req.status],
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {STATUS_ICONS[req.status]}
                </span>

                {/* Section */}
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", fontFamily: "monospace" }}>
                  {req.section}
                </span>

                {/* Requirement text */}
                <span style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.4 }}>
                  {isExpanded ? req.requirement : req.requirement.length > 120 ? req.requirement.slice(0, 120) + "..." : req.requirement}
                </span>

                {/* Category badge */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(59,130,246,0.1)",
                    color: "#3b82f6",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {CATEGORY_LABELS[req.category] ?? req.category}
                </span>

                {/* Status badge */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${STATUS_COLORS[req.status]}20`,
                    color: STATUS_COLORS[req.status],
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_LABELS[req.status] ?? req.status}
                </span>

                {/* Expand arrow */}
                <span style={{ color: "var(--color-text-muted)", fontSize: 12, textAlign: "center" }}>
                  {isExpanded ? "\u25B2" : "\u25BC"}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-border)" }}>
                  <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <DetailField label="Solicitation" value={req.solicitation_title} />
                    <DetailField label="Responsible Party" value={req.responsible_party} />
                    <DetailField
                      label="Evidence"
                      value={req.evidence ?? "No evidence provided"}
                      valueColor={req.evidence ? "var(--color-text)" : "#ef4444"}
                    />
                    <DetailField
                      label="Notes"
                      value={req.notes ?? "None"}
                      valueColor={req.notes ? "var(--color-text)" : "var(--color-text-muted)"}
                    />
                  </div>

                  {/* Related clauses */}
                  {req.related_clause_ids.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Related Clauses
                      </span>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {req.related_clause_ids.map((cid) => (
                          <span
                            key={cid}
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "rgba(139,92,246,0.1)",
                              color: "#8b5cf6",
                              fontFamily: "monospace",
                            }}
                          >
                            {cid}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
                    Updated {new Date(req.updated_at).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Clauses Tab
// ---------------------------------------------------------------------------

function ClausesTab({
  clauses,
  typeCounts,
  clauseSearch,
  setClauseSearch,
  clauseTypeFilter,
  setClauseTypeFilter,
  expandedClause,
  setExpandedClause,
}: {
  clauses: ClauseReferenceRow[];
  typeCounts: Record<string, number>;
  clauseSearch: string;
  setClauseSearch: (v: string) => void;
  clauseTypeFilter: string;
  setClauseTypeFilter: (v: string) => void;
  expandedClause: string | null;
  setExpandedClause: (v: string | null) => void;
}) {
  return (
    <>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Search clauses..."
          value={clauseSearch}
          onChange={(e) => setClauseSearch(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            minWidth: 200,
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(CLAUSE_TYPE_LABELS).map(([k, v]) => {
            const count = typeCounts[k] ?? 0;
            if (count === 0) return null;
            const active = clauseTypeFilter === k;
            return (
              <button
                key={k}
                onClick={() => setClauseTypeFilter(active ? "" : k)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: `1px solid ${active ? CLAUSE_TYPE_COLORS[k] : "var(--color-border)"}`,
                  background: active ? `${CLAUSE_TYPE_COLORS[k]}15` : "transparent",
                  color: active ? CLAUSE_TYPE_COLORS[k] : "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {v} ({count})
              </button>
            );
          })}
        </div>
        {(clauseSearch || clauseTypeFilter) && (
          <button
            onClick={() => { setClauseSearch(""); setClauseTypeFilter(""); }}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>

      <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginBottom: 12 }}>
        Showing {clauses.length} clause{clauses.length !== 1 ? "s" : ""}
      </p>

      {/* Clause cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {clauses.map((clause) => {
          const isExpanded = expandedClause === clause.id;
          return (
            <div
              key={clause.id}
              style={{
                background: "var(--color-surface)",
                border: `1px solid ${isExpanded ? CLAUSE_TYPE_COLORS[clause.type] ?? "var(--color-border)" : "var(--color-border)"}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpandedClause(isExpanded ? null : clause.id)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${CLAUSE_TYPE_COLORS[clause.type]}15`,
                    color: CLAUSE_TYPE_COLORS[clause.type],
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {clause.clause_number}
                </span>

                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", flex: 1 }}>
                  {clause.title}
                </span>

                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${CLAUSE_TYPE_COLORS[clause.type]}15`,
                    color: CLAUSE_TYPE_COLORS[clause.type],
                    fontWeight: 600,
                  }}
                >
                  {CLAUSE_TYPE_LABELS[clause.type] ?? clause.type}
                </span>

                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                  {isExpanded ? "\u25B2" : "\u25BC"}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-border)" }}>
                  {/* Summary */}
                  <div style={{ paddingTop: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Summary
                    </span>
                    <p style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.5, marginTop: 4 }}>
                      {clause.summary}
                    </p>
                  </div>

                  {/* Full text */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Full Text
                    </span>
                    <p style={{
                      fontSize: 12,
                      color: "var(--color-text)",
                      lineHeight: 1.6,
                      marginTop: 4,
                      background: "var(--color-bg)",
                      padding: 12,
                      borderRadius: 6,
                      fontStyle: "italic",
                    }}>
                      {clause.full_text}
                    </p>
                  </div>

                  {/* Applicability */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Applicability
                    </span>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {clause.applicability.map((a) => (
                        <span
                          key={a}
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "rgba(59,130,246,0.1)",
                            color: "#3b82f6",
                          }}
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Common pitfalls */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Common Pitfalls
                    </span>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      {clause.common_pitfalls.map((p, i) => (
                        <li key={i} style={{ fontSize: 12, color: "#f59e0b", lineHeight: 1.6 }}>
                          <span style={{ color: "var(--color-text)" }}>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Related clauses */}
                  {clause.related_clauses.length > 0 && (
                    <div>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Related Clauses
                      </span>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {clause.related_clauses.map((rc) => (
                          <span
                            key={rc}
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "rgba(139,92,246,0.1)",
                              color: "#8b5cf6",
                              fontFamily: "monospace",
                            }}
                          >
                            {rc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
                    Last updated {new Date(clause.last_updated).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail field helper
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </span>
      <p style={{ fontSize: 13, color: valueColor ?? "var(--color-text)", lineHeight: 1.4, marginTop: 2 }}>
        {value}
      </p>
    </div>
  );
}
