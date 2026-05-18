import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ExportButton from "../components/ExportButton";
import InfoBadge from "../components/InfoBadge";
import SourceBadge from "../components/SourceBadge";
import {
  fetchOpportunities,
  qualifyOpportunity,
  changeOpportunityStage,
  fetchRecommendations,
  SHIPLEY_STAGES,
  type OpportunityRow,
  type OpportunitiesData,
  type SmartRecommendation,
} from "../api/client";

type SortKey =
  | "id"
  | "title"
  | "department"
  | "value_estimated"
  | "probability_of_win"
  | "score"
  | "status"
  | "naics_size"
  | "due_date";

const STATUS_COLORS: Record<string, string> = {
  discovery: "#f59e0b",
  qualified: "#3b82f6",
  pipeline: "#8b5cf6",
  won: "#22c55e",
  lost: "#ef4444",
  no_bid: "#9ca3af",
  gov_cancelled: "#6b7280",
};

function formatCurrency(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPwin(v: number | null): string {
  if (v === null || v === undefined || v === 0) return "—";
  return `${Math.round(v * 100)}%`;
}

function isExpired(d: string | null): boolean {
  if (!d) return false;
  return new Date(d) < new Date();
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function statusToShipley(status: string): string {
  const map: Record<string, string> = {
    discovery: "interest",
    qualified: "qualify",
    pipeline: "pursue",
    won: "won",
    lost: "lost",
    no_bid: "no_bid",
    gov_cancelled: "gov_cancelled",
  };
  return map[status] ?? "interest";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    discovery: "Interest",
    qualified: "Qualify",
    pipeline: "Pursue",
    won: "Won",
    lost: "Lost",
    no_bid: "No Bid",
    gov_cancelled: "Gov Cancelled",
  };
  return labels[status] ?? status;
}

export default function OpsTracker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<OpportunitiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View filter: "active" (default) or "all_tracked" — controls which canonical view
  const urlFilter = searchParams.get("filter");
  const [viewFilter, setViewFilter] = useState<"active" | "all_tracked">(urlFilter === "all_tracked" ? "all_tracked" : "active");

  // Filters — initialize status from URL query param if present
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [deptFilter, setDeptFilter] = useState("");
  const [naicsSizeFilter, setNaicsSizeFilter] = useState("");
  const [minPwin, setMinPwin] = useState("");
  const [includeLowFit, setIncludeLowFit] = useState(viewFilter === "all_tracked");

  // Sort
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Qualify modal
  const [qualifyTarget, setQualifyTarget] = useState<OpportunityRow | null>(null);
  const [qualifyLoading, setQualifyLoading] = useState(false);
  const [qualifyResult, setQualifyResult] = useState<string | null>(null);

  // Smart recommendations
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [paginationMeta, setPaginationMeta] = useState<{ totalFiltered?: number; totalPages?: number; totalAvailable?: number; totalValue?: number; avgPwin?: number; avgScore?: number; departments?: string[] }>({});
  const totalFiltered = paginationMeta.totalFiltered;
  const totalPages = paginationMeta.totalPages ?? 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchOpportunities({
        search: search || undefined,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        naics_size: naicsSizeFilter || undefined,
        minPwin: minPwin ? parseFloat(minPwin) : undefined,
        includeLowFit: includeLowFit || undefined,
        includeAllStatuses: viewFilter === "all_tracked" || undefined,
        sortBy,
        sortDir,
        page,
        pageSize,
      });
      if (env.success && env.data) {
        setData(env.data);
        const meta = env.meta as Record<string, unknown> | undefined;
        if (meta) {
          setPaginationMeta({
            totalFiltered: meta.totalFiltered as number | undefined,
            totalPages: meta.totalPages as number | undefined,
            totalAvailable: meta.totalAvailable as number | undefined,
            totalValue: meta.totalValue as number | undefined,
            avgPwin: meta.avgPwin as number | undefined,
            avgScore: meta.avgScore as number | undefined,
            departments: meta.departments as string[] | undefined,
          });
        }
      } else {
        setError(env.error?.message ?? "Unknown error");
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, deptFilter, naicsSizeFilter, minPwin, includeLowFit, viewFilter, sortBy, sortDir, page]);

  useEffect(() => {
    load();
    fetchRecommendations().then((e) => {
      if (e.success && e.data) setRecommendations(e.data.recommendations);
    }).catch(() => {});
  }, [load]);

  const opportunities = data?.opportunities ?? [];
  const source = data?.source ?? "db";

  // Derive unique departments for filter dropdown — prefer backend aggregate over page slice
  const departments = useMemo(() => {
    if (paginationMeta.departments && paginationMeta.departments.length > 0) {
      return paginationMeta.departments;
    }
    const depts = new Set<string>();
    for (const o of opportunities) {
      if (o.department) depts.add(o.department);
    }
    return Array.from(depts).sort();
  }, [opportunities, paginationMeta.departments]);

  // Summary strip — prefer backend aggregate stats over page slice
  const summary = useMemo(() => {
    const total = paginationMeta.totalFiltered ?? opportunities.length;
    const totalValue = paginationMeta.totalValue ?? opportunities.reduce(
      (s, o) => s + (o.value_estimated ?? 0),
      0
    );
    const avgPwin = paginationMeta.avgPwin ?? (() => {
      const withPwin = opportunities.filter((o) => o.probability_of_win !== null);
      return withPwin.length > 0
        ? withPwin.reduce((s, o) => s + (o.probability_of_win ?? 0), 0) / withPwin.length
        : 0;
    })();
    const avgScore = paginationMeta.avgScore ?? (
      opportunities.length > 0 ? opportunities.reduce((s, o) => s + o.score, 0) / opportunities.length : 0
    );
    return { total, totalValue, avgPwin, avgScore };
  }, [opportunities, paginationMeta]);

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

  async function handleQualifyDryRun(opp: OpportunityRow) {
    setQualifyTarget(opp);
    setQualifyLoading(true);
    setQualifyResult(null);
    try {
      const env = await qualifyOpportunity(opp.id, true, false);
      if (env.success && env.data) {
        setQualifyResult(
          `Dry-run OK — would change "${env.data.title}" from ${env.data.prev_status} → ${env.data.new_status}. Correlation: ${env.data.correlation_id}`
        );
      } else {
        setQualifyResult(`Error: ${env.error?.message ?? "Unknown"}`);
      }
    } catch (e: unknown) {
      setQualifyResult(`Network error: ${(e as Error).message}`);
    } finally {
      setQualifyLoading(false);
    }
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
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Ops Tracker</h1>
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
        <ExportButton endpoint="opportunities" label="Export CSV" />
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
          {source === "n8n" ? "Live API" : "Live DB"}
        </span>
      </div>

      {/* Summary strip */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 16,
          padding: "12px 16px",
          background: "var(--color-surface)",
          borderRadius: 8,
          fontSize: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Count </span>
          <strong>{summary.total}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Total Value </span>
          <strong>{formatCurrency(summary.totalValue)}</strong>
          <InfoBadge
            whatItIs="Sum of estimated values for all displayed opportunities."
            whatItMeans="Total addressable contract value in your current view."
            size={14}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Avg Pwin </span>
          <strong>{formatPwin(summary.avgPwin)}</strong>
          <InfoBadge
            whatItIs="Average probability of win across displayed opportunities."
            whatItMeans="Higher Pwin means stronger competitive position."
            howCalculated="Composite of: Technical Fit (30%), Past Performance (25%), Competition (20%), Customer Relationship (15%), Price (10%)."
            size={14}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--color-text-muted)" }}>Avg Score </span>
          <strong>{summary.avgScore.toFixed(1)}</strong>
          <InfoBadge
            whatItIs="Average opportunity quality score."
            whatItMeans="Above 70 is strong, 50-70 moderate, below 50 needs review."
            howCalculated="Each opp scored 0-100 on: strategic fit, revenue potential, competitive landscape, incumbent advantage, contract vehicle access, past performance."
            size={14}
          />
        </div>
      </div>

      {/* View filter chip — AC-W7-3: label which view is being shown */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Showing:</span>
        {(["active", "all_tracked"] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setViewFilter(v); setIncludeLowFit(v === "all_tracked"); setPage(1); }}
            style={{
              padding: "4px 12px",
              borderRadius: 16,
              border: viewFilter === v ? "2px solid var(--color-accent, #3b82f6)" : "1px solid var(--color-border)",
              background: viewFilter === v ? "var(--color-accent, #3b82f6)" : "var(--color-surface)",
              color: viewFilter === v ? "#fff" : "var(--color-text)",
              fontSize: 13,
              fontWeight: viewFilter === v ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {v === "active" ? "Active" : "All Tracked"}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontStyle: "italic" }}>
          {viewFilter === "active" ? "v_opportunity_active" : "v_opportunity_all_tracked"}
        </span>
      </div>

      {/* Filters */}
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
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
          }}
        >
          <option value="">All statuses</option>
          <option value="discovery">Interest</option>
          <option value="qualified">Qualify</option>
          <option value="pipeline">Pursue</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="no_bid">No Bid</option>
        </select>
        <select
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
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
        <select
          value={naicsSizeFilter}
          onChange={(e) => { setNaicsSizeFilter(e.target.value); setPage(1); }}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
          }}
        >
          <option value="">All NAICS sizes</option>
          <option value="small">Small Business</option>
          <option value="large">Large Business</option>
        </select>
        <input
          type="number"
          placeholder="Min Pwin (0-1)"
          value={minPwin}
          onChange={(e) => { setMinPwin(e.target.value); setPage(1); }}
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--color-text-muted)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={includeLowFit}
            onChange={(e) => { setIncludeLowFit(e.target.checked); setPage(1); }}
          />
          Show Low Fit
        </label>
        {(search || statusFilter || deptFilter || naicsSizeFilter || minPwin || includeLowFit) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setDeptFilter("");
              setNaicsSizeFilter("");
              setMinPwin("");
              setIncludeLowFit(false);
              setPage(1);
            }}
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

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            borderRadius: 8,
            background: "rgba(239,68,68,0.1)",
            color: "#ef4444",
            borderLeft: "3px solid #ef4444",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{
            padding: "40px 0",
            textAlign: "center",
            color: "var(--color-text-muted)",
          }}
        >
          Loading opportunities…
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort("id")}>
                  ID{sortArrow("id")}
                </th>
                <th style={thStyle} onClick={() => handleSort("title")}>
                  Title{sortArrow("title")}
                </th>
                <th style={thStyle} onClick={() => handleSort("department")}>
                  Dept{sortArrow("department")}
                </th>
                <th style={thStyle} onClick={() => handleSort("value_estimated")}>
                  Value{sortArrow("value_estimated")}
                </th>
                <th style={thStyle} onClick={() => handleSort("probability_of_win")}>
                  Pwin{sortArrow("probability_of_win")}
                </th>
                <th style={thStyle} onClick={() => handleSort("score")}>
                  Score{sortArrow("score")}
                </th>
                <th style={thStyle} onClick={() => handleSort("status")}>
                  Status{sortArrow("status")}
                </th>
                <th style={thStyle} onClick={() => handleSort("naics_size")}>
                  NAICS Size{sortArrow("naics_size")}
                </th>
                <th style={thStyle} onClick={() => handleSort("due_date")}>
                  Due{sortArrow("due_date")}
                </th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                      padding: "40px 12px",
                    }}
                  >
                    {search || statusFilter || deptFilter || naicsSizeFilter || minPwin || includeLowFit
                      ? "No opportunities match your filters."
                      : "No opportunities found."}
                  </td>
                </tr>
              )}
              {opportunities.map((opp) => (
                <tr
                  key={opp.id}
                  style={{ transition: "background 0.15s", cursor: "pointer" }}
                  onClick={() => navigate(`/opportunities/${opp.id}`, { state: { from: "/ops-tracker" } })}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.03)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {opp.id.slice(0, 12)}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 320 }}>
                    <div
                      style={{
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                      title={opp.title}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{opp.title}</span>
                      <SourceBadge source={opp.data_source} />
                    </div>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontSize: 13,
                      color: "var(--color-text-muted)",
                      maxWidth: 180,
                    }}
                  >
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={opp.department ?? ""}
                    >
                      {opp.department ?? "—"}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {formatCurrency(opp.value_estimated)}
                  </td>
                  <td style={tdStyle}>
                    {formatPwin(opp.probability_of_win)}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 600,
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
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        background: `${STATUS_COLORS[opp.status] ?? "#666"}20`,
                        color: STATUS_COLORS[opp.status] ?? "#666",
                        textTransform: "capitalize",
                      }}
                    >
                      {statusLabel(opp.status)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {opp.naics_size ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          background: opp.naics_size === "small" ? "rgba(59,130,246,0.15)" : "rgba(245,158,11,0.15)",
                          color: opp.naics_size === "small" ? "#3b82f6" : "#f59e0b",
                        }}
                      >
                        {opp.naics_size === "small" ? "Small" : "Large"}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      color: isExpired(opp.due_date) && opp.status !== "won" && opp.status !== "lost" && opp.status !== "no_bid" ? "#ef4444" : "var(--color-text-muted)",
                      fontWeight: isExpired(opp.due_date) && opp.status !== "won" && opp.status !== "lost" && opp.status !== "no_bid" ? 600 : 400,
                    }}
                  >
                    {formatDate(opp.due_date)}
                    {isExpired(opp.due_date) && opp.status !== "won" && opp.status !== "lost" && opp.status !== "no_bid" && (
                      <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 700 }}>
                        EXPIRED
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={opp.capture_stage ?? statusToShipley(opp.status)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => {
                        e.stopPropagation();
                        const newStage = e.target.value;
                        try {
                          await changeOpportunityStage(opp.id, newStage);
                          load();
                        } catch {
                          // fallback: try qualify for backward compat
                          if (newStage === "qualify") {
                            await qualifyOpportunity(opp.id, false, true);
                            load();
                          }
                        }
                      }}
                      style={{
                        padding: "3px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        color: SHIPLEY_STAGES.find(s => s.value === (opp.capture_stage ?? statusToShipley(opp.status)))?.color ?? "var(--color-text)",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                        minWidth: 100,
                      }}
                    >
                      {SHIPLEY_STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls */}
      {!loading && opportunities.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}
        >
          <span>
            Page {page} of {totalPages} — showing {opportunities.length} of{" "}
            {totalFiltered ?? opportunities.length} opportunities
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: page <= 1 ? "transparent" : "var(--color-surface)",
                color: page <= 1 ? "var(--color-text-muted)" : "var(--color-text)",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: page >= totalPages ? "transparent" : "var(--color-surface)",
                color: page >= totalPages ? "var(--color-text-muted)" : "var(--color-text)",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Smart Recommendations */}
      {recommendations.length > 0 && (
        <div style={{
          marginTop: 24,
          padding: 20,
          background: "var(--color-surface)",
          borderRadius: 8,
          border: "1px solid var(--color-border)",
        }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
            Smart Recommendations
            <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 400, marginLeft: 8 }}>
              ({recommendations.length})
            </span>
          </h3>
          <div style={{ display: "grid", gap: 8 }}>
            {recommendations.slice(0, 6).map((rec) => (
              <div
                key={rec.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  borderLeft: `3px solid ${rec.type === "action" ? "#3b82f6" : rec.type === "risk" ? "#ef4444" : rec.type === "opportunity" ? "#22c55e" : "#8b5cf6"}`,
                  cursor: "pointer",
                }}
                onClick={() => navigate(`/opportunities/${rec.opp_id}`, { state: { from: "/ops-tracker" } })}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: rec.type === "action" ? "#3b82f6" : rec.type === "risk" ? "#ef4444" : rec.type === "opportunity" ? "#22c55e" : "#8b5cf6",
                    }}>
                      {rec.type}
                    </span>
                    <span style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: rec.priority === "high" ? "rgba(239,68,68,0.15)" : rec.priority === "medium" ? "rgba(245,158,11,0.15)" : "rgba(107,114,128,0.15)",
                      color: rec.priority === "high" ? "#ef4444" : rec.priority === "medium" ? "#f59e0b" : "#6b7280",
                      fontWeight: 600,
                    }}>
                      {rec.priority}
                    </span>
                  </div>
                  {rec.deadline && (
                    <span style={{ fontSize: 10, color: "#f59e0b" }}>
                      Due: {new Date(rec.deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{rec.title}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{rec.impact}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Qualify dry-run modal */}
      {qualifyTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setQualifyTarget(null);
            setQualifyResult(null);
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: "90%",
              border: "1px solid var(--color-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>
              Qualify Opportunity (Dry Run)
            </h3>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-text-muted)" }}>
              <strong>{qualifyTarget.title}</strong>
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
              Current status: <strong>{statusLabel(qualifyTarget.status)}</strong>
              {" → "}
              <strong style={{ color: "#3b82f6" }}>Qualified</strong>
            </p>

            {qualifyLoading && (
              <p style={{ color: "var(--color-text-muted)" }}>Running dry-run…</p>
            )}

            {qualifyResult && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: qualifyResult.startsWith("Error")
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(34,197,94,0.1)",
                  color: qualifyResult.startsWith("Error") ? "#ef4444" : "#22c55e",
                  fontSize: 13,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {qualifyResult}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setQualifyTarget(null);
                  setQualifyResult(null);
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
