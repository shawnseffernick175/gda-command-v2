import { useEffect, useState } from "react";
import {
  fetchProposals,
  type ProposalsData,
  type ProposalRow,
  type RedTeamFindingRow,
  type ProposalVolumeRow,
  type ProposalScorecardRow,
  type ProposalTimelineRow,
} from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  in_review: "#f59e0b",
  red_team: "#ef4444",
  final: "#3b82f6",
  submitted: "#22c55e",
  archived: "#9ca3af",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  red_team: "Red Team",
  final: "Final",
  submitted: "Submitted",
  archived: "Archived",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  major: "#ef4444",
  minor: "#f59e0b",
  observation: "#6b7280",
};

const FINDING_STATUS_COLORS: Record<string, string> = {
  open: "#ef4444",
  addressed: "#22c55e",
  accepted_risk: "#f59e0b",
};

const TIMELINE_COLORS: Record<string, string> = {
  completed: "#22c55e",
  on_track: "#3b82f6",
  at_risk: "#f59e0b",
  overdue: "#ef4444",
};

const VOLUME_TYPE_LABELS: Record<string, string> = {
  technical: "Technical",
  management: "Management",
  past_performance: "Past Performance",
  cost_price: "Cost/Price",
  executive_summary: "Exec Summary",
  cover_letter: "Cover Letter",
  other: "Other",
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (86400 * 1000));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type TabKey = "overview" | "volumes" | "red_team" | "scorecard" | "timeline";

export default function ProposalReview() {
  const [data, setData] = useState<ProposalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchProposals()
      .then((env) => {
        if (env.success && env.data) {
          setData(env.data);
          if (env.data.proposals.length > 0) setSelected(env.data.proposals[0].id);
        } else {
          setError(env.error?.message ?? "Failed to load proposals");
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading proposals...</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;
  if (!data) return null;

  const source = data.source;

  // Filter proposals
  let proposals = data.proposals;
  if (search) {
    const q = search.toLowerCase();
    proposals = proposals.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.solicitation_title.toLowerCase().includes(q) ||
        p.agency.toLowerCase().includes(q),
    );
  }
  if (statusFilter) proposals = proposals.filter((p) => p.status === statusFilter);
  if (agencyFilter) proposals = proposals.filter((p) => p.agency === agencyFilter);

  const selectedProposal = proposals.find((p) => p.id === selected) ?? null;
  const { summary } = data;

  // Summary counts
  const active = data.total - (summary.statusCounts["submitted"] ?? 0) - (summary.statusCounts["archived"] ?? 0);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Proposal Review</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 8 }}>
        Track proposals, evaluate volumes, review red team findings, and monitor submission timelines.
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
          { label: "Total", value: String(data.total), color: "var(--color-text)" },
          { label: "Active", value: String(active), color: "#3b82f6" },
          { label: "Avg Compliance", value: `${summary.avgCompliance}%`, color: summary.avgCompliance >= 80 ? "#22c55e" : summary.avgCompliance >= 60 ? "#f59e0b" : "#ef4444" },
          { label: "Pipeline Value", value: formatCurrency(summary.totalValue), color: "#8b5cf6" },
          { label: "Agencies", value: String(summary.agencies.length), color: "var(--color-text-muted)" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "12px 20px",
              minWidth: 110,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search proposals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            width: 240,
          }}
        />
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
            <option key={k} value={k}>{v} ({summary.statusCounts[k] ?? 0})</option>
          ))}
        </select>
        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Agencies</option>
          {summary.agencies.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {(search || statusFilter || agencyFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); setAgencyFilter(""); }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Split view: list + detail */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Proposal list */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
            {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                isSelected={p.id === selected}
                onClick={() => { setSelected(p.id); setTab("overview"); }}
              />
            ))}
            {proposals.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: 13, padding: 12 }}>No proposals match filters.</p>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedProposal && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <ProposalDetail proposal={selectedProposal} tab={tab} onTabChange={setTab} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposal Card
// ---------------------------------------------------------------------------
function ProposalCard({ proposal, isSelected, onClick }: { proposal: ProposalRow; isSelected: boolean; onClick: () => void }) {
  const statusColor = STATUS_COLORS[proposal.status] ?? "#6b7280";
  const days = daysUntil(proposal.due_date);
  const openFindings = proposal.red_team_findings.filter((f) => f.status === "open").length;
  const scoreColor = proposal.overall_score >= 80 ? "#22c55e" : proposal.overall_score >= 60 ? "#f59e0b" : proposal.overall_score > 0 ? "#ef4444" : "#6b7280";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${isSelected ? "var(--color-primary)" : "var(--color-border)"}`,
        background: isSelected ? "rgba(59,130,246,0.08)" : "var(--color-surface)",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 600,
            background: `${statusColor}20`,
            color: statusColor,
          }}
        >
          {STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
        {proposal.overall_score > 0 && (
          <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>{proposal.overall_score}</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
        {proposal.solicitation_title}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
        {proposal.agency} &middot; {formatCurrency(proposal.value_estimated)}
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
        <span style={{ color: days <= 14 && days > 0 ? "#f59e0b" : days <= 0 ? "#ef4444" : "var(--color-text-muted)" }}>
          {days > 0 ? `${days}d until due` : days === 0 ? "Due today" : proposal.submission_date ? `Submitted ${formatDate(proposal.submission_date)}` : `${Math.abs(days)}d overdue`}
        </span>
        {openFindings > 0 && (
          <span style={{ color: "#ef4444", fontWeight: 600 }}>
            {openFindings} open finding{openFindings !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------
function ProposalDetail({ proposal, tab, onTabChange }: { proposal: ProposalRow; tab: TabKey; onTabChange: (t: TabKey) => void }) {
  const statusColor = STATUS_COLORS[proposal.status] ?? "#6b7280";
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "volumes", label: "Volumes", count: proposal.volumes.length },
    { key: "red_team", label: "Red Team", count: proposal.red_team_findings.length },
    { key: "scorecard", label: "Scorecard", count: proposal.scorecard.length },
    { key: "timeline", label: "Timeline", count: proposal.timeline.length },
  ];

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600, background: `${statusColor}20`, color: statusColor }}>
            {STATUS_LABELS[proposal.status] ?? proposal.status}
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{proposal.id}</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{proposal.solicitation_title}</h2>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--color-text-muted)", flexWrap: "wrap" }}>
          <span>{proposal.agency}</span>
          <span>{formatCurrency(proposal.value_estimated)}</span>
          <span>PM: {proposal.proposal_manager}</span>
          <span>CM: {proposal.capture_manager}</span>
        </div>
      </div>

      {/* Win Themes */}
      {proposal.win_themes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>Win Themes</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {proposal.win_themes.map((t, i) => (
              <span
                key={i}
                style={{
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  background: "rgba(59,130,246,0.1)",
                  color: "#3b82f6",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--color-border)", marginBottom: 16 }}>
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? "var(--color-primary)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: tab === key ? "2px solid var(--color-primary)" : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {label}
            {count !== undefined && (
              <span style={{
                padding: "0 6px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
                background: tab === key ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.06)",
                color: tab === key ? "var(--color-primary)" : "var(--color-text-muted)",
              }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab proposal={proposal} />}
      {tab === "volumes" && <VolumesTab volumes={proposal.volumes} />}
      {tab === "red_team" && <RedTeamTab findings={proposal.red_team_findings} />}
      {tab === "scorecard" && <ScorecardTab scorecard={proposal.scorecard} overallScore={proposal.overall_score} />}
      {tab === "timeline" && <TimelineTab timeline={proposal.timeline} dueDate={proposal.due_date} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------
function OverviewTab({ proposal }: { proposal: ProposalRow }) {
  const compColor = proposal.compliance_score >= 80 ? "#22c55e" : proposal.compliance_score >= 60 ? "#f59e0b" : "#ef4444";
  const scoreColor = proposal.overall_score >= 80 ? "#22c55e" : proposal.overall_score >= 60 ? "#f59e0b" : proposal.overall_score > 0 ? "#ef4444" : "#6b7280";
  const openFindings = proposal.red_team_findings.filter((f) => f.status === "open").length;
  const addressedFindings = proposal.red_team_findings.filter((f) => f.status === "addressed").length;
  const days = daysUntil(proposal.due_date);
  const totalPages = proposal.volumes.reduce((s, v) => s + v.page_count, 0);
  const totalWords = proposal.volumes.reduce((s, v) => s + v.word_count, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Scores */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>Scores</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>{proposal.overall_score || "\u2014"}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Overall Score</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, color: compColor }}>{proposal.compliance_score}%</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Compliance</div>
          </div>
        </div>
      </div>

      {/* Red Team Status */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>Red Team</div>
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: openFindings > 0 ? "#ef4444" : "#22c55e" }}>{openFindings}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Open</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>{addressedFindings}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Addressed</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{proposal.red_team_findings.length}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Total</div>
          </div>
        </div>
      </div>

      {/* Document Stats */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>Document</div>
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{proposal.volumes.length}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Volumes</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{totalPages}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Pages</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{(totalWords / 1000).toFixed(1)}K</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Words</div>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>Schedule</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: days <= 14 && days > 0 ? "#f59e0b" : days <= 0 ? "#ef4444" : "var(--color-text)" }}>
              {days > 0 ? days : proposal.submission_date ? "Done" : Math.abs(days)}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {days > 0 ? "Days Left" : proposal.submission_date ? "Submitted" : "Days Overdue"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{formatDate(proposal.due_date)}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Due Date</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volumes Tab
// ---------------------------------------------------------------------------
function VolumesTab({ volumes }: { volumes: ProposalVolumeRow[] }) {
  if (volumes.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No volumes yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {volumes.map((v) => {
        const compColor = v.compliance_score >= 80 ? "#22c55e" : v.compliance_score >= 60 ? "#f59e0b" : v.compliance_score > 0 ? "#ef4444" : "#6b7280";
        return (
          <div
            key={v.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <span style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 600,
              background: "rgba(59,130,246,0.1)",
              color: "#3b82f6",
              whiteSpace: "nowrap",
            }}>
              {VOLUME_TYPE_LABELS[v.type] ?? v.type}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                {v.page_count} pages &middot; {(v.word_count / 1000).toFixed(1)}K words &middot; {v.last_editor}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: compColor }}>{v.compliance_score}%</div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>compliance</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Red Team Tab
// ---------------------------------------------------------------------------
function RedTeamTab({ findings }: { findings: RedTeamFindingRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (findings.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No red team findings yet.</p>;
  }

  // Summary row
  const critical = findings.filter((f) => f.severity === "critical").length;
  const major = findings.filter((f) => f.severity === "major").length;
  const open = findings.filter((f) => f.status === "open").length;
  const addressed = findings.filter((f) => f.status === "addressed").length;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Critical", value: critical, color: SEVERITY_COLORS.critical },
          { label: "Major", value: major, color: SEVERITY_COLORS.major },
          { label: "Open", value: open, color: FINDING_STATUS_COLORS.open },
          { label: "Addressed", value: addressed, color: FINDING_STATUS_COLORS.addressed },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Findings list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {findings.map((f) => {
          const isExpanded = expanded === f.id;
          const sevColor = SEVERITY_COLORS[f.severity] ?? "#6b7280";
          const statColor = FINDING_STATUS_COLORS[f.status] ?? "#6b7280";
          const statLabel = f.status === "accepted_risk" ? "Accepted Risk" : f.status.charAt(0).toUpperCase() + f.status.slice(1);

          return (
            <div
              key={f.id}
              style={{
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
                overflow: "hidden",
              }}
            >
              <div
                onClick={() => setExpanded(isExpanded ? null : f.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 12, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>&#9654;</span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 600,
                  background: `${sevColor}20`,
                  color: sevColor,
                  textTransform: "uppercase",
                }}>
                  {f.severity}
                </span>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.finding}
                </div>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 600,
                  background: `${statColor}20`,
                  color: statColor,
                }}>
                  {statLabel}
                </span>
              </div>

              {isExpanded && (
                <div style={{ padding: "0 14px 14px 36px", fontSize: 13 }}>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11 }}>Section: </span>
                    <span>{f.section}</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11 }}>Finding: </span>
                    <span>{f.finding}</span>
                  </div>
                  <div style={{ marginBottom: 8, padding: "8px 12px", background: "rgba(59,130,246,0.06)", borderRadius: 6, borderLeft: "3px solid #3b82f6" }}>
                    <span style={{ fontWeight: 600, color: "#3b82f6", fontSize: 11 }}>Recommendation: </span>
                    <span>{f.recommendation}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--color-text-muted)" }}>
                    {f.assigned_to && <span>Assigned: {f.assigned_to}</span>}
                    <span>Created: {formatDate(f.created_at)}</span>
                    {f.resolved_at && <span>Resolved: {formatDate(f.resolved_at)}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scorecard Tab
// ---------------------------------------------------------------------------
function ScorecardTab({ scorecard, overallScore }: { scorecard: ProposalScorecardRow[]; overallScore: number }) {
  if (scorecard.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No scorecard data yet.</p>;
  }

  const totalWeight = scorecard.reduce((s, c) => s + c.weight, 0);
  const totalScore = scorecard.reduce((s, c) => s + c.score, 0);
  const totalMax = scorecard.reduce((s, c) => s + c.max_score, 0);
  const scoreColor = overallScore >= 80 ? "#22c55e" : overallScore >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div>
      {/* Overall score */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: scoreColor }}>{overallScore}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Overall Score</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{totalScore}/{totalMax} points ({totalWeight}% total weight)</div>
        </div>
      </div>

      {/* Criteria table */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {scorecard.map((c) => {
          const pct = c.max_score > 0 ? (c.score / c.max_score) * 100 : 0;
          const barColor = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";

          return (
            <div
              key={c.criteria}
              style={{
                padding: "12px 14px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.criteria}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 8 }}>Weight: {c.weight}%</span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: barColor }}>{c.score}/{c.max_score}</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                {c.notes}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>Evaluator: {c.evaluator}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline Tab
// ---------------------------------------------------------------------------
function TimelineTab({ timeline, dueDate }: { timeline: ProposalTimelineRow[]; dueDate: string }) {
  if (timeline.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No timeline milestones.</p>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
        Final submission due: <strong style={{ color: "var(--color-text)" }}>{formatDate(dueDate)}</strong>
      </div>

      <div style={{ position: "relative", paddingLeft: 20 }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute",
          left: 7,
          top: 4,
          bottom: 4,
          width: 2,
          background: "rgba(255,255,255,0.08)",
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {timeline.map((m) => {
            const color = TIMELINE_COLORS[m.status] ?? "#6b7280";
            const statusLabel = m.status.replace(/_/g, " ");

            return (
              <div key={m.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                {/* Dot */}
                <div style={{
                  position: "absolute",
                  left: -16,
                  top: 4,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: color,
                  border: "2px solid var(--color-surface)",
                }} />

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{m.milestone}</span>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      background: `${color}20`,
                      color: color,
                      textTransform: "capitalize",
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                    <span>{formatDate(m.due_date)}</span>
                    <span>{m.owner}</span>
                  </div>
                  {m.notes && (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic", marginTop: 4 }}>{m.notes}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
