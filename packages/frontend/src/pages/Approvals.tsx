import { useEffect, useState } from "react";
import SourceBadge from "../components/SourceBadge";
import {
  fetchApprovals,
  resolveApproval,
  type ApprovalsData,
  type ApprovalRow,
  type ApprovalResolveData,
  type ApprovalCheckRow,
} from "../api/client";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  expired: "#6b7280",
};

const CATEGORY_LABELS: Record<string, string> = {
  qualify_write: "Qualify",
  bid_decision: "Bid Decision",
  doctrine_publish: "Doctrine Publish",
  gate_review: "Gate Review",
  teaming_agreement: "Teaming",
  deploy: "Deploy",
  budget_override: "Budget Override",
};

const CHECK_ICONS: Record<string, string> = {
  pass: "\u2713",
  warn: "\u26A0",
  fail: "\u2717",
};

const CHECK_COLORS: Record<string, string> = {
  pass: "#22c55e",
  warn: "#f59e0b",
  fail: "#ef4444",
};

type TabKey = "pending" | "resolved" | "all";

export default function Approvals() {
  const [data, setData] = useState<ApprovalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<ApprovalResolveData | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchApprovals()
      .then((env) => {
        if (env.success && env.data) setData(env.data);
        else setError(env.error?.message ?? "Failed to load approvals");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading approvals...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;
  if (!data) return null;

  // Filter approvals by tab
  let items = data.approvals;
  if (tab === "pending") items = items.filter((a) => a.status === "pending");
  else if (tab === "resolved") items = items.filter((a) => a.status !== "pending");

  // Apply search
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.requester.toLowerCase().includes(q),
    );
  }

  // Apply category filter
  if (categoryFilter) {
    items = items.filter((a) => a.category === categoryFilter);
  }

  const handleResolve = async (id: string, action: "approve" | "reject") => {
    setResolving(id);
    try {
      const env = await resolveApproval(id, action, undefined, true);
      if (env.success && env.data) setResolveResult(env.data);
    } catch (e) {
      // ignore for now
    }
    setResolving(null);
  };

  const { summary } = data;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Approvals Queue</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 8 }}>
        Human-in-the-loop approval for risky actions. Review, approve, or reject pending items.
      </p>

      <span
        style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 4,
          background: data.source === "mock" ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)",
          color: data.source === "mock" ? "#3b82f6" : "#22c55e",
          marginBottom: 16,
        }}
      >
        {data.source === "n8n" ? "Live \u2014 n8n" : data.source === "db" ? "Live \u2014 database" : "Mock data"}
      </span>

      {/* Summary strip */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
      }}>
        {[
          { label: "Pending", value: summary.pending, color: "#f59e0b" },
          { label: "Critical", value: summary.critical, color: "#ef4444" },
          { label: "Expiring Soon", value: summary.expiringSoon, color: "#f97316" },
          { label: "Approved", value: summary.approved, color: "#22c55e" },
          { label: "Rejected", value: summary.rejected, color: "#ef4444" },
          { label: "Expired", value: summary.expired, color: "#6b7280" },
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
        {(["pending", "resolved", "all"] as TabKey[]).map((t) => (
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
              textTransform: "capitalize",
            }}
          >
            {t === "pending" ? `Pending (${summary.pending})` : t === "resolved" ? `Resolved (${summary.approved + summary.rejected + summary.expired})` : `All (${data.approvals.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Search approvals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            width: 220,
          }}
        />
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
      </div>

      {/* Approval items — grouped by category type */}
      {items.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No approvals match filters.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {(() => {
            const oppCats = new Set(["qualify_write", "bid_decision", "gate_review"]);
            const riskCats = new Set(["budget_override", "teaming_agreement"]);
            const groups = [
              { label: "Opportunities", color: "#3b82f6", items: items.filter((a) => oppCats.has(a.category)) },
              { label: "Risks", color: "#f59e0b", items: items.filter((a) => riskCats.has(a.category)) },
              { label: "Other", color: "#6b7280", items: items.filter((a) => !oppCats.has(a.category) && !riskCats.has(a.category)) },
            ].filter((g) => g.items.length > 0);
            return groups.map((group) => (
              <div key={group.label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: group.color, letterSpacing: "0.05em" }}>
                    {group.label}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>({group.items.length})</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.items.map((item) => (
                    <ApprovalCard
                      key={item.id}
                      item={item}
                      expanded={expanded === item.id}
                      onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                      onResolve={handleResolve}
                      resolving={resolving === item.id}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Dry-run result modal */}
      {resolveResult && (
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
          onClick={() => setResolveResult(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-surface)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: "90%",
              border: "1px solid var(--color-border)",
            }}
          >
            <h3 style={{ marginBottom: 12 }}>Dry-Run Result</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Action: <strong style={{ textTransform: "capitalize" }}>{resolveResult.proposed_action}</strong>
              {" \u2192 "}
              <span style={{ color: STATUS_COLORS[resolveResult.would_change_to ?? ""] ?? "var(--color-text)" }}>
                {resolveResult.would_change_to}
              </span>
            </p>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 16 }}>
              Correlation: <code>{resolveResult.correlation_id}</code>
            </p>
            {resolveResult.dry_run_result && (
              <div>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
                  Overall:{" "}
                  <span style={{ color: CHECK_COLORS[resolveResult.dry_run_result.overall] }}>
                    {resolveResult.dry_run_result.overall.toUpperCase()}
                  </span>
                </div>
                {resolveResult.dry_run_result.checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: CHECK_COLORS[c.status], fontWeight: 700, width: 16 }}>{CHECK_ICONS[c.status]}</span>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span style={{ color: "var(--color-text-muted)" }}>{c.message}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setResolveResult(null)}
              style={{
                marginTop: 16,
                padding: "8px 20px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  item,
  expanded,
  onToggle,
  onResolve,
  resolving,
}: {
  item: ApprovalRow;
  expanded: boolean;
  onToggle: () => void;
  onResolve: (id: string, action: "approve" | "reject") => void;
  resolving: boolean;
}) {
  const timeAgo = getTimeAgo(item.created_at);
  const expiresIn = item.expires_at ? getTimeUntil(item.expires_at) : null;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${item.priority === "critical" ? "#ef4444" : "var(--color-border)"}`,
        borderRadius: 8,
        padding: "12px 16px",
        cursor: "pointer",
        borderLeft: `4px solid ${PRIORITY_COLORS[item.priority] ?? "var(--color-border)"}`,
      }}
      onClick={onToggle}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 4,
            background: `${PRIORITY_COLORS[item.priority]}22`,
            color: PRIORITY_COLORS[item.priority],
            textTransform: "uppercase",
          }}
        >
          {item.priority}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 4,
            background: `${STATUS_COLORS[item.status]}22`,
            color: STATUS_COLORS[item.status],
            textTransform: "uppercase",
          }}
        >
          {item.status}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 4,
            background: "rgba(100,116,139,0.15)",
            color: "#94a3b8",
          }}
        >
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
          {item.id}
        </span>
        <span style={{ fontSize: 14, color: "var(--color-text-muted)" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>

      {/* Title & meta */}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>{item.title} <SourceBadge source={(item as any).data_source} /></div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        Requested by {item.requester} {timeAgo}
        {expiresIn && item.status === "pending" && (
          <span style={{ color: "#f97316", marginLeft: 8 }}>Expires {expiresIn}</span>
        )}
        {item.resolved_at && (
          <span style={{ marginLeft: 8 }}>
            Resolved by {item.resolved_by} on {new Date(item.resolved_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--color-border)", paddingTop: 12 }} onClick={(e) => e.stopPropagation()}>
          <p style={{ fontSize: 13, marginBottom: 12 }}>{item.description}</p>

          {item.correlation_id && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Correlation ID: <code style={{ background: "rgba(100,116,139,0.1)", padding: "1px 4px", borderRadius: 3 }}>{item.correlation_id}</code>
            </div>
          )}

          {/* Dry-run checks */}
          {item.dry_run_result && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Dry-Run:{" "}
                <span style={{ color: CHECK_COLORS[item.dry_run_result.overall] }}>
                  {item.dry_run_result.overall.toUpperCase()}
                </span>
                <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 8 }}>
                  {item.dry_run_result.checks.length} checks
                </span>
              </div>
              {item.dry_run_result.checks.map((c: ApprovalCheckRow, i: number) => (
                <div key={i} style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12,
                  marginBottom: 3,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: `${CHECK_COLORS[c.status]}08`,
                }}>
                  <span style={{ color: CHECK_COLORS[c.status], fontWeight: 700, width: 16, flexShrink: 0 }}>
                    {CHECK_ICONS[c.status]}
                  </span>
                  <span style={{ fontWeight: 500, minWidth: 120 }}>{c.name}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>{c.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Resolution notes */}
          {item.resolution_notes && (
            <div style={{
              fontSize: 12,
              padding: "8px 12px",
              borderRadius: 6,
              background: "rgba(100,116,139,0.08)",
              marginBottom: 12,
              borderLeft: `3px solid ${STATUS_COLORS[item.status]}`,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Resolution Notes</div>
              {item.resolution_notes}
            </div>
          )}

          {/* Action buttons for pending items */}
          {item.status === "pending" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onResolve(item.id, "approve")}
                disabled={resolving}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: resolving ? "wait" : "pointer",
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                {resolving ? "..." : "Approve (Dry-Run)"}
              </button>
              <button
                onClick={() => onResolve(item.id, "reject")}
                disabled={resolving}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: resolving ? "wait" : "pointer",
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                {resolving ? "..." : "Reject (Dry-Run)"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

function getTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `in ${days}d`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `in ${hours}h`;
  return "soon";
}
