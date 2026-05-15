import { useEffect, useState } from "react";
import SourceBadge from "../components/SourceBadge";
import {
  fetchApprovals,
  resolveApproval,
  approveOpportunity,
  fetchAgentApprovalsPending,
  fetchAgentApprovalsStats,
  approveAgentApproval,
  rejectAgentApproval,
  fetchAgents,
  enableAgent,
  disableAgent,
  fetchRecentAgentRuns,
  type ApprovalsData,
  type ApprovalRow,
  type ApprovalResolveData,
  type ApprovalCheckRow,
  type AgentApprovalItem,
  type AgentConfigItem,
  type AgentRunRow,
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

type TabKey = "agent-actions" | "agent-runs" | "agent-config" | "pending" | "resolved" | "all";

export default function Approvals() {
  const [data, setData] = useState<ApprovalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("agent-actions");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<ApprovalResolveData | null>(null);
  const [agentPending, setAgentPending] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchApprovals()
      .then((env) => {
        if (env.success && env.data) setData(env.data);
        else setError(env.error?.message ?? "Failed to load approvals");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    fetchAgentApprovalsStats()
      .then((env) => {
        if (env.success && env.data) setAgentPending(env.data.total_pending);
      })
      .catch(() => {});
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
      if (env.success && env.data) {
        setResolveResult(env.data);
        // After dry-run preview succeeds, perform real approval + pipeline entry
        if (action === "approve") {
          try {
            await resolveApproval(id, action, undefined, false);
          } catch {
            // non-blocking — dry-run already succeeded
          }
          const approval = items.find((a) => a.id === id);
          if (approval?.related_entity_id && (approval.category === "qualify_write" || approval.category === "bid_decision")) {
            try {
              await approveOpportunity(approval.related_entity_id, "user");
            } catch {
              // non-blocking — approval still succeeded
            }
          }
        }
      }
    } catch (e) {
      // ignore for now
    }
    setResolving(null);
  };

  const { summary } = data;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Agent Command Center</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 8 }}>
        Monitor autonomous agents, approve pending actions, and manage agent configuration.
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
        {data.source === "n8n" ? "Live \u2014 n8n" : "Live \u2014 database"}
      </span>

      {/* Summary strip */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
      }}>
        {[
          { label: "Pending", value: summary.pending + agentPending, color: "#f59e0b" },
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
        {(["agent-actions", "agent-runs", "agent-config", "pending", "resolved", "all"] as TabKey[]).map((t) => {
          const label = t === "agent-actions" ? "Agent Actions"
            : t === "agent-runs" ? "Agent Runs"
            : t === "agent-config" ? "Agent Config"
            : t === "pending" ? `Pending (${summary.pending})`
            : t === "resolved" ? `Resolved (${summary.approved + summary.rejected + summary.expired})`
            : `All (${data.approvals.length})`;
          return (
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
              {label}
            </button>
          );
        })}
      </div>

      {tab === "agent-actions" && <AgentActionsTab />}
      {tab === "agent-runs" && <AgentRunsTab />}
      {tab === "agent-config" && <AgentConfigTab />}

      {/* Filters (for opportunity approval tabs) */}
      {tab !== "agent-actions" && tab !== "agent-runs" && tab !== "agent-config" && (
        <>
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
        </>
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

// ---------------------------------------------------------------------------
// Agent Runs Tab
// ---------------------------------------------------------------------------

const RUN_STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  running: "#3b82f6",
  failed: "#ef4444",
  pending: "#f59e0b",
};

function AgentRunsTab() {
  const [runs, setRuns] = useState<AgentRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentAgentRuns(50)
      .then((env) => {
        if (env.success && env.data) setRuns(env.data.runs);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading runs...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;

  if (runs.length === 0) {
    return (
      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        background: "var(--color-surface)",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
      }}>
        <p style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontSize: 14 }}>
          No agent runs yet. Agents will log their executions here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
            {["Agent", "Trigger", "Status", "Started", "Duration", "Items", "Flagged", "Error"].map((h) => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>{AGENT_NAME_LABELS[r.agent] ?? r.agent}</td>
              <td style={{ padding: "8px 12px" }}>
                <span style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(100,116,139,0.15)",
                  color: "#94a3b8",
                }}>
                  {r.trigger}
                </span>
              </td>
              <td style={{ padding: "8px 12px" }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: `${RUN_STATUS_COLORS[r.status] ?? "#6b7280"}22`,
                  color: RUN_STATUS_COLORS[r.status] ?? "#6b7280",
                  textTransform: "uppercase",
                }}>
                  {r.status}
                </span>
              </td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--color-text-muted)" }}>
                {new Date(r.started_at).toLocaleString()}
              </td>
              <td style={{ padding: "8px 12px", fontSize: 12 }}>
                {r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
              </td>
              <td style={{ padding: "8px 12px" }}>{r.items_processed ?? "—"}</td>
              <td style={{ padding: "8px 12px", color: (r.items_flagged ?? 0) > 0 ? "#f59e0b" : "inherit" }}>
                {r.items_flagged ?? "—"}
              </td>
              <td style={{ padding: "8px 12px", fontSize: 11, color: "#ef4444", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.error ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Config Tab
// ---------------------------------------------------------------------------

function AgentConfigTab() {
  const [agents, setAgents] = useState<AgentConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadAgents = () => {
    setLoading(true);
    fetchAgents()
      .then((env) => {
        if (env.success && env.data) setAgents(env.data.agents);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAgents(); }, []);

  const handleToggle = async (agent: AgentConfigItem) => {
    setToggling(agent.agent);
    try {
      if (agent.enabled) {
        await disableAgent(agent.agent);
      } else {
        await enableAgent(agent.agent);
      }
      loadAgents();
    } catch {
      // ignore
    }
    setToggling(null);
  };

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading agents...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {agents.map((a) => (
        <div
          key={a.agent}
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "16px 20px",
            borderLeft: `4px solid ${a.enabled ? "#22c55e" : "#6b7280"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{a.display_name || (AGENT_NAME_LABELS[a.agent] ?? a.agent)}</div>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 4,
              background: a.enabled ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)",
              color: a.enabled ? "#22c55e" : "#6b7280",
              textTransform: "uppercase",
            }}>
              {a.enabled ? "Enabled" : "Disabled"}
            </span>
            {a.schedule && (
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>
                {a.schedule}
              </span>
            )}
            <button
              onClick={() => handleToggle(a)}
              disabled={toggling === a.agent}
              style={{
                marginLeft: "auto",
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: a.enabled ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                color: a.enabled ? "#ef4444" : "#22c55e",
                fontWeight: 600,
                fontSize: 12,
                cursor: toggling === a.agent ? "wait" : "pointer",
              }}
            >
              {toggling === a.agent ? "..." : a.enabled ? "Disable" : "Enable"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
            {a.description || "No description"}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--color-text-muted)" }}>
            <span>Last run: {a.last_run_at ? new Date(a.last_run_at).toLocaleString() : "Never"}</span>
            {a.last_status && (
              <span>
                Status:{" "}
                <span style={{ color: RUN_STATUS_COLORS[a.last_status] ?? "#6b7280", fontWeight: 600 }}>
                  {a.last_status}
                </span>
              </span>
            )}
            {a.last_duration_ms != null && <span>Duration: {(a.last_duration_ms / 1000).toFixed(1)}s</span>}
            {a.last_items_processed != null && <span>Items: {a.last_items_processed}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Actions Tab
// ---------------------------------------------------------------------------

const AGENT_TYPE_LABELS: Record<string, string> = {
  send_email: "Send Email",
  api_call: "API Call",
  deploy: "Deploy",
  data_write: "Data Write",
  workflow_fix: "Workflow Fix",
  opportunity_action: "Opportunity Action",
  intel_publish: "Intel Publish",
  risk_escalation: "Risk Escalation",
};

const AGENT_NAME_LABELS: Record<string, string> = {
  "morning-commander": "Morning Commander",
  "opportunity-watch": "Opportunity Watch",
  "capture-coach": "Capture Coach",
  "competitive-intel": "Competitive Intel",
  "controlled-fix": "Controlled Fix",
  "approval-queue": "Approval Queue",
};

function AgentActionsTab() {
  const [items, setItems] = useState<AgentApprovalItem[]>([]);
  const [stats, setStats] = useState<{ by_type: Array<{ type: string; pending: string; approved: string; rejected: string; total: string }>; total_pending: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  const loadData = () => {
    setLoading(true);
    const params: { type?: string; agent?: string } = {};
    if (agentFilter) params.agent = agentFilter;
    if (typeFilter) params.type = typeFilter;
    Promise.all([
      fetchAgentApprovalsPending(params),
      fetchAgentApprovalsStats(),
    ])
      .then(([pendingEnv, statsEnv]) => {
        if (pendingEnv.success && pendingEnv.data) setItems(pendingEnv.data.items);
        if (statsEnv.success && statsEnv.data) setStats(statsEnv.data);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [agentFilter, typeFilter]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      await approveAgentApproval(id, noteInput[id]);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (stats) setStats({ ...stats, total_pending: stats.total_pending - 1 });
    } catch {
      // ignore
    }
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      await rejectAgentApproval(id, noteInput[id]);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (stats) setStats({ ...stats, total_pending: stats.total_pending - 1 });
    } catch {
      // ignore
    }
    setProcessing(null);
  };

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading agent actions...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;

  return (
    <div>
      {/* Stats row */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "12px 20px",
            textAlign: "center",
            minWidth: 100,
          }}>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Pending</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stats.total_pending > 0 ? "#f59e0b" : "#22c55e" }}>{stats.total_pending}</div>
          </div>
          {stats.by_type.map((t) => (
            <div key={t.type} style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "12px 20px",
              textAlign: "center",
              minWidth: 100,
            }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {AGENT_TYPE_LABELS[t.type] ?? t.type}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                <span style={{ color: "#f59e0b" }}>{t.pending}</span>
                {" / "}
                <span style={{ color: "#22c55e" }}>{t.approved}</span>
                {" / "}
                <span style={{ color: "#ef4444" }}>{t.rejected}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Agents</option>
          {Object.entries(AGENT_NAME_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Types</option>
          {Object.entries(AGENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          onClick={loadData}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "40px 20px",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>&#x2714;</div>
          <p style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontSize: 14 }}>
            No pending agent actions. All clear.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const isProcessing = processing === item.id;
            const timeAgo = getTimeAgo(item.created_at);

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--color-surface)",
                  border: `1px solid ${item.priority === "critical" ? "#ef4444" : "var(--color-border)"}`,
                  borderRadius: 8,
                  borderLeft: `4px solid ${PRIORITY_COLORS[item.priority] ?? "var(--color-border)"}`,
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{ padding: "12px 16px", cursor: "pointer" }}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: `${PRIORITY_COLORS[item.priority]}22`,
                      color: PRIORITY_COLORS[item.priority],
                      textTransform: "uppercase",
                    }}>
                      {item.priority}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "rgba(59,130,246,0.15)",
                      color: "#3b82f6",
                    }}>
                      {AGENT_NAME_LABELS[item.agent] ?? item.agent}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "rgba(100,116,139,0.15)",
                      color: "#94a3b8",
                    }}>
                      {AGENT_TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>{timeAgo}</span>
                    <span style={{ fontSize: 14, color: "var(--color-text-muted)" }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                  {item.summary && (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{item.summary}</div>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
                    {/* Data payload */}
                    {item.data && Object.keys(item.data).length > 0 && (
                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4, textTransform: "uppercase" }}>Details</div>
                        <div style={{
                          background: "rgba(100,116,139,0.08)",
                          borderRadius: 6,
                          padding: "8px 12px",
                          fontSize: 12,
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          maxHeight: 200,
                          overflow: "auto",
                        }}>
                          {JSON.stringify(item.data, null, 2)}
                        </div>
                      </div>
                    )}

                    {item.expires_at && (
                      <div style={{ fontSize: 11, color: "#f97316", marginBottom: 8 }}>
                        Expires: {new Date(item.expires_at).toLocaleString()}
                      </div>
                    )}

                    {/* Note input */}
                    <div style={{ marginBottom: 12 }}>
                      <input
                        placeholder="Add a note (optional)..."
                        value={noteInput[item.id] ?? ""}
                        onChange={(e) => setNoteInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        style={{
                          width: "100%",
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                          fontSize: 12,
                        }}
                      />
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={isProcessing}
                        style={{
                          padding: "8px 20px",
                          borderRadius: 6,
                          border: "none",
                          background: "#22c55e",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: isProcessing ? "wait" : "pointer",
                          opacity: isProcessing ? 0.6 : 1,
                        }}
                      >
                        {isProcessing ? "Processing..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        disabled={isProcessing}
                        style={{
                          padding: "8px 20px",
                          borderRadius: 6,
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: isProcessing ? "wait" : "pointer",
                          opacity: isProcessing ? 0.6 : 1,
                        }}
                      >
                        {isProcessing ? "Processing..." : "Reject"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>{item.title} <SourceBadge source={item.data_source} /></div>
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
