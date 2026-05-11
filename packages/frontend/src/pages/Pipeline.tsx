import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ExportButton from "../components/ExportButton";
import InfoBadge from "../components/InfoBadge";
import SourceBadge from "../components/SourceBadge";
import {
  fetchPipelineOpportunities,
  type OpportunityRow,
  type OpportunitiesData,
} from "../api/client";

type SortKey =
  | "title"
  | "department"
  | "value_estimated"
  | "probability_of_win"
  | "score"
  | "qualified_at"
  | "due_date";

function formatCurrency(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPwin(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default function Pipeline() {
  const navigate = useNavigate();
  const [data, setData] = useState<OpportunitiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (no status filter — pipeline only)
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [minPwin, setMinPwin] = useState("");

  // Sort — default qualified_at DESC per S-008
  const [sortBy, setSortBy] = useState<SortKey>("qualified_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchPipelineOpportunities({
        search: search || undefined,
        department: deptFilter || undefined,
        minPwin: minPwin ? parseFloat(minPwin) : undefined,
        sortBy,
        sortDir,
      });
      if (env.success && env.data) {
        setData(env.data);
      } else {
        setError(env.error?.message ?? "Unknown error");
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, minPwin, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  const opportunities = data?.opportunities ?? [];
  const source = data?.source ?? "mock";

  // Derive unique departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const o of opportunities) {
      if (o.department) depts.add(o.department);
    }
    return Array.from(depts).sort();
  }, [opportunities]);

  // Summary strip
  const summary = useMemo(() => {
    const total = opportunities.length;
    const totalValue = opportunities.reduce(
      (s, o) => s + (o.value_estimated ?? 0),
      0
    );
    const withPwin = opportunities.filter((o) => o.probability_of_win !== null);
    const avgPwin =
      withPwin.length > 0
        ? withPwin.reduce((s, o) => s + (o.probability_of_win ?? 0), 0) /
          withPwin.length
        : 0;
    const avgScore =
      total > 0 ? opportunities.reduce((s, o) => s + o.score, 0) / total : 0;
    return { total, totalValue, avgPwin, avgScore };
  }, [opportunities]);

  function handleSort(col: SortKey) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  function sortArrow(col: SortKey) {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--color-text-muted)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 14,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Pipeline</h1>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Refresh
        </button>
        <ExportButton endpoint="pipeline" label="Export CSV" />
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            background: source === "n8n" ? "rgba(168,85,247,0.15)" : source === "db" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
            color: source === "n8n" ? "#a855f7" : source === "db" ? "#22c55e" : "#3b82f6",
          }}
        >
          {source === "n8n" ? "Live n8n" : source === "db" ? "Live DB" : "Mock data"}
        </span>
      </div>

      {/* Summary strip */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 8,
          padding: "12px 16px",
          background: "var(--color-surface)",
          borderRadius: 8,
          fontSize: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Pipeline Count </span>
          <InfoBadge size={14} whatItIs="Number of opportunities in your active pipeline." whatItMeans="Qualified opportunities being actively pursued." />
          <strong>{summary.total}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Total Value </span>
          <InfoBadge size={14} whatItIs="Sum of estimated contract values in the pipeline." whatItMeans="Total revenue potential of all active pursuits." howCalculated="Sum of value_estimated for Qualified + Pipeline status opps." />
          <strong>{formatCurrency(summary.totalValue)}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Avg Pwin </span>
          <InfoBadge size={14} whatItIs="Average probability of win across pipeline." whatItMeans="Higher = stronger pipeline. Below 40% signals weak positioning." howCalculated="Mean of all opportunity Pwin values in pipeline." />
          <strong>{formatPwin(summary.avgPwin)}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Avg Score </span>
          <InfoBadge size={14} whatItIs="Average opportunity score across pipeline." whatItMeans="Composite score factoring Pwin, value, and strategic fit." />
          <strong>{summary.avgScore.toFixed(1)}</strong>
        </div>
      </div>

      {/* Audit acknowledgement per S-008 */}
      <div
        style={{
          marginBottom: 16,
          padding: "8px 16px",
          background: "rgba(139,92,246,0.08)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--color-text-muted)",
        }}
      >
        Read-only view — all qualify writes are server-logged with correlation IDs per S-008. Audit history view coming in a future milestone.
      </div>

      {/* Filters (no status — always pipeline) */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="Search by ID or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
            width: 260,
          }}
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
          }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Min Pwin (0-1)"
          value={minPwin}
          onChange={(e) => setMinPwin(e.target.value)}
          step="0.1"
          min="0"
          max="1"
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
            width: 130,
          }}
        />
        {(search || deptFilter || minPwin) && (
          <button
            onClick={() => {
              setSearch("");
              setDeptFilter("");
              setMinPwin("");
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: "rgba(239,68,68,0.1)",
            color: "#ef4444",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--color-text-muted)",
          }}
        >
          Loading pipeline…
        </div>
      )}

      {/* Table */}
      {data && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "auto",
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle} onClick={() => handleSort("title")}>
                    Title{sortArrow("title")}
                  </th>
                  <th style={thStyle} onClick={() => handleSort("department")}>
                    Dept{sortArrow("department")}
                  </th>
                  <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("value_estimated")}>
                    Value{sortArrow("value_estimated")}
                  </th>
                  <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("probability_of_win")}>
                    Pwin{sortArrow("probability_of_win")}
                  </th>
                  <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("score")}>
                    Score{sortArrow("score")}
                  </th>
                  <th style={thStyle} onClick={() => handleSort("qualified_at")}>
                    Qualified{sortArrow("qualified_at")}
                  </th>
                  <th style={thStyle} onClick={() => handleSort("due_date")}>
                    Due{sortArrow("due_date")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => (
                  <tr
                    key={opp.id}
                    style={{ cursor: "pointer", transition: "background 0.15s" }}
                    onClick={() => navigate(`/opportunities/${opp.id}`, { state: { from: "/pipeline" } })}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  >
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "var(--color-text-muted)" }}>
                      {opp.id}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 340 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                        {opp.title}
                        <SourceBadge source={opp.data_source} />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--color-text-muted)", maxWidth: 220 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {opp.department ?? "—"}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                      {formatCurrency(opp.value_estimated)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{formatPwin(opp.probability_of_win)}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 700,
                        color:
                          opp.score >= 80
                            ? "#22c55e"
                            : opp.score >= 60
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {opp.score.toFixed(1)}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--color-text-muted)" }}>
                      {formatDate(opp.qualified_at)}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--color-text-muted)" }}>
                      {formatDate(opp.due_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Record count / empty state */}
          <div
            style={{
              padding: "12px 0",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            {opportunities.length === 0
              ? search || deptFilter || minPwin
                ? "No pipeline opportunities match the current filters."
                : "No opportunities are currently in the pipeline."
              : `Showing ${opportunities.length} pipeline ${opportunities.length === 1 ? "opportunity" : "opportunities"}`}
          </div>
        </>
      )}
    </div>
  );
}
