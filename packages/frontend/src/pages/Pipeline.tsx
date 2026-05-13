import { useEffect, useState, useCallback, useMemo } from "react";
import ExportButton from "../components/ExportButton";
import InfoBadge from "../components/InfoBadge";
import OpportunityTable from "../components/OpportunityRow";
import {
  fetchPipelineOpportunities,
  type OpportunityRow,
  type OpportunitiesData,
} from "../api/client";

function formatCurrency(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPwin(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

export default function Pipeline() {
  const [data, setData] = useState<OpportunitiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [minPwin, setMinPwin] = useState("");

  const [sortBy, setSortBy] = useState("qualified_at");
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
  const source = data?.source ?? "db";

  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const o of opportunities) {
      if (o.department) depts.add(o.department);
    }
    return Array.from(depts).sort();
  }, [opportunities]);

  const summary = useMemo(() => {
    const total = opportunities.length;
    const totalValue = opportunities.reduce((s, o) => s + (o.value_estimated ?? 0), 0);
    const withPwin = opportunities.filter((o) => o.probability_of_win !== null);
    const avgPwin = withPwin.length > 0 ? withPwin.reduce((s, o) => s + (o.probability_of_win ?? 0), 0) / withPwin.length : 0;
    const deptSet = new Set(opportunities.map((o) => o.department).filter(Boolean));
    const dueThisMonth = opportunities.filter((o) => {
      if (!o.due_date) return false;
      const due = new Date(o.due_date);
      const now = new Date();
      return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
    }).length;
    return { total, totalValue, avgPwin, agencies: deptSet.size, dueThisMonth };
  }, [opportunities]);

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

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
            background: source === "n8n" ? "rgba(168,85,247,0.15)" : "rgba(34,197,94,0.15)",
            color: source === "n8n" ? "#a855f7" : "#22c55e",
          }}
        >
          {source === "n8n" ? "Live API" : "Live DB"}
        </span>
      </div>

      <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 16 }}>
        Only opportunities approved through the Approvals queue with 30+ days until due date appear here.
        Past-due and near-expiry opportunities are routed to the Capture Planner No Bid folder.
      </p>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Pipeline", value: String(summary.total), color: "var(--color-text)" },
          { label: "Weighted Value", value: formatCurrency(summary.totalValue), color: "#8b5cf6" },
          { label: "Avg Pwin", value: formatPwin(summary.avgPwin), color: summary.avgPwin >= 0.4 ? "#22c55e" : "#f59e0b" },
          { label: "Departments", value: String(summary.agencies), color: "var(--color-text-muted)" },
          { label: "Due This Month", value: String(summary.dueThisMonth), color: summary.dueThisMonth > 0 ? "#ef4444" : "#22c55e" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "12px 20px",
              minWidth: 120,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
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
            <option key={d} value={d}>{d}</option>
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
            onClick={() => { setSearch(""); setDeptFilter(""); setMinPwin(""); }}
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
        <div style={{ padding: 16, borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
          Loading pipeline…
        </div>
      )}

      {/* Table — uses universal opportunity component */}
      {data && (
        <>
          <OpportunityTable
            opportunities={opportunities}
            from="/pipeline"
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            emptyMessage={
              search || deptFilter || minPwin
                ? "No pipeline opportunities match the current filters."
                : "No approved opportunities in the pipeline yet. Approve opportunities from the Approvals queue to see them here."
            }
          />
          <div style={{ padding: "12px 0", fontSize: 13, color: "var(--color-text-muted)" }}>
            {opportunities.length === 0
              ? null
              : `Showing ${opportunities.length} approved pipeline ${opportunities.length === 1 ? "opportunity" : "opportunities"}`}
          </div>
        </>
      )}
    </div>
  );
}
