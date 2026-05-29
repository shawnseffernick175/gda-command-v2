import { useEffect, useState, useMemo } from "react";
import {
  fetchWorkflowRegistry,
  type WorkflowSummary,
  type WorkflowRegistryData,
} from "../api/client";

type SortField = "name" | "active" | "nodeCount" | "updatedAt";
type SortDir = "asc" | "desc";

interface CategoryGroup {
  label: string;
  prefix: string;
  color: string;
}

const CATEGORIES: CategoryGroup[] = [
  { label: "API", prefix: "GDA.api.", color: "#3b82f6" },
  { label: "QA", prefix: "GDA.qa.", color: "#f59e0b" },
  { label: "Doctrine", prefix: "GDA.doctrine.", color: "#8b5cf6" },
  { label: "Cron", prefix: "GDA.cron.", color: "#22c55e" },
  { label: "Deploy", prefix: "GDA.deploy.", color: "#ef4444" },
  { label: "Intel", prefix: "GDA.intel.", color: "#06b6d4" },
];

function categorize(name: string): CategoryGroup | null {
  return CATEGORIES.find((c) => name.startsWith(c.prefix)) ?? null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function Workflows() {
  const [data, setData] = useState<WorkflowRegistryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetchWorkflowRegistry()
      .then((env) => {
        if (env.success && env.data) {
          setData(env.data);
        } else {
          setError(env.error?.message ?? "Failed to load workflows");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.workflows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q));
    }
    if (filterActive === "active") list = list.filter((w) => w.active);
    if (filterActive === "inactive") list = list.filter((w) => !w.active);
    if (filterCategory !== "all") {
      const cat = CATEGORIES.find((c) => c.label === filterCategory);
      if (cat) {
        list = list.filter((w) => w.name.startsWith(cat.prefix));
      } else {
        list = list.filter((w) => !CATEGORIES.some((c) => w.name.startsWith(c.prefix)));
      }
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "active":
          cmp = (a.active ? 1 : 0) - (b.active ? 1 : 0);
          break;
        case "nodeCount":
          cmp = (a.nodeCount ?? 0) - (b.nodeCount ?? 0);
          break;
        case "updatedAt":
          cmp = (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, filterActive, filterCategory, sortField, sortDir]);

  const categoryStats = useMemo(() => {
    if (!data) return [];
    const stats = CATEGORIES.map((cat) => {
      const matching = data.workflows.filter((w) => w.name.startsWith(cat.prefix));
      return {
        ...cat,
        count: matching.length,
        active: matching.filter((w) => w.active).length,
      };
    });
    const categorized = stats.reduce((sum, s) => sum + s.count, 0);
    const other = data.workflows.length - categorized;
    return [
      ...stats.filter((s) => s.count > 0),
      ...(other > 0
        ? [
            {
              label: "Other",
              prefix: "",
              color: "#6b7280",
              count: other,
              active: data.workflows.filter(
                (w) => w.active && !CATEGORIES.some((c) => w.name.startsWith(c.prefix))
              ).length,
            },
          ]
        : []),
    ];
  }, [data]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
        Loading workflows...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>Workflow Engine Unavailable</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 16, maxWidth: 480, margin: "0 auto 16px" }}>
          Could not connect to the n8n workflow engine. This is expected in development if n8n is not running.
          All other GDA Command features work independently.
        </p>
        <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 16,  background: "var(--color-surface)", padding: "8px 16px", borderRadius: 6, display: "inline-block" }}>
          {error}
        </div>
        <div>
          <button
            onClick={() => { setError(null); setLoading(true); fetchWorkflowRegistry().then((env) => { if (env.success && env.data) { setData(env.data); } else { setError(env.error?.message ?? "Failed to load workflows"); } }).catch((err) => setError(err.message)).finally(() => setLoading(false)); }}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none",
              background: "#3b82f6", color: "#fff", fontSize: 14,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isLive = data.source === "n8n-live";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Workflow Manager</h1>
        <span
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 12,
            fontWeight: 600,
            background: isLive ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
            color: isLive ? "#22c55e" : "#f59e0b",
          }}
        >
          {isLive ? "Live API" : "Not configured"}
        </span>
      </div>

      {/* Summary strip */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <SummaryCard label="Total" value={data.summary.total} />
        <SummaryCard label="Active" value={data.summary.active} color="#22c55e" />
        <SummaryCard label="Inactive" value={data.summary.total - data.summary.active} color="#6b7280" />
      </div>

      {/* Category breakdown */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <CategoryChip
          label="All"
          count={data.summary.total}
          color="var(--color-primary)"
          selected={filterCategory === "all"}
          onClick={() => setFilterCategory("all")}
        />
        {categoryStats.map((cat) => (
          <CategoryChip
            key={cat.label}
            label={cat.label}
            count={cat.count}
            color={cat.color}
            selected={filterCategory === cat.label}
            onClick={() => setFilterCategory(cat.label)}
          />
        ))}
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search workflows..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
            minWidth: 240,
          }}
        />
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
          }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          {filtered.length} of {data.summary.total} workflows
        </span>
      </div>

      {/* Workflow table */}
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "var(--color-surface)" }}>
              <Th onClick={() => toggleSort("name")}>
                Name{sortIndicator("name")}
              </Th>
              <Th onClick={() => toggleSort("active")} style={{ width: 100, textAlign: "center" }}>
                Status{sortIndicator("active")}
              </Th>
              <Th onClick={() => toggleSort("nodeCount")} style={{ width: 90, textAlign: "right" }}>
                Nodes{sortIndicator("nodeCount")}
              </Th>
              <Th onClick={() => toggleSort("updatedAt")} style={{ width: 140, textAlign: "right" }}>
                Updated{sortIndicator("updatedAt")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
                  No workflows match your filters
                </td>
              </tr>
            ) : (
              filtered.map((w) => <WorkflowRow key={w.id} workflow={w} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "14px 20px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  color,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 20,
        border: selected ? `2px solid ${color}` : "1px solid var(--color-border)",
        background: selected ? `${color}20` : "var(--color-surface)",
        color: selected ? color : "var(--color-text-muted)",
        fontSize: 13,
        fontWeight: selected ? 600 : 400,
        cursor: "pointer",
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
      <span style={{ opacity: 0.7 }}>({count})</span>
    </button>
  );
}

function Th({
  children,
  onClick,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "10px 14px",
        textAlign: "left",
        fontWeight: 600,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "var(--color-text-muted)",
        borderBottom: "1px solid var(--color-border)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function WorkflowRow({ workflow: w }: { workflow: WorkflowSummary }) {
  const cat = categorize(w.name);
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--color-border)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "";
      }}
    >
      <td style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {cat && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 10,
                background: `${cat.color}20`,
                color: cat.color,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {cat.label}
            </span>
          )}
          <span style={{ fontWeight: 500 }}>{w.name}</span>
        </div>
      </td>
      <td style={{ padding: "10px 14px", textAlign: "center" }}>
        <span
          style={{
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 12,
            fontWeight: 600,
            background: w.active ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)",
            color: w.active ? "#22c55e" : "#6b7280",
          }}
        >
          {w.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--color-text-muted)" }}>
        {w.nodeCount ?? "—"}
      </td>
      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--color-text-muted)", fontSize: 13 }}>
        {timeAgo(w.updatedAt)}
      </td>
    </tr>
  );
}
