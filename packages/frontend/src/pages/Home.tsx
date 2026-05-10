import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchDashboardKPIs,
  fetchCommandSignals,
  type DashboardKPIs,
  type DashboardFunnelStage,
  type OpportunityRow,
  type CommandSignalsData,
} from "../api/client";

function formatCurrency(v: number | null): string {
  if (v === null || v === undefined || v === 0) return "$0";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPwin(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (86400 * 1000));
}

const STAGE_COLORS: Record<string, string> = {
  discovery: "#f59e0b",
  qualified: "#3b82f6",
  pipeline: "#8b5cf6",
  won: "#22c55e",
  lost: "#ef4444",
};

const URGENCY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  at_risk: "#ef4444",
  overdue: "#dc2626",
  on_track: "#22c55e",
};

export default function Home() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [signals, setSignals] = useState<CommandSignalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchDashboardKPIs(),
      fetchCommandSignals(),
    ])
      .then(([kpiEnv, sigEnv]) => {
        if (kpiEnv.success && kpiEnv.data) setKpis(kpiEnv.data);
        else setError(kpiEnv.error?.message ?? "Failed to load dashboard");
        if (sigEnv.success && sigEnv.data) setSignals(sigEnv.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        GDA Command Center
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>
        Shawn's operating system for Golden Dome / GDA business development,
        capture, competitive intelligence, opportunity management, and platform
        health.
      </p>

      {loading && (
        <div style={{ padding: "20px 0", color: "var(--color-text-muted)", fontSize: 14 }}>
          Loading dashboard…
        </div>
      )}

      {error && (
        <div style={{
          padding: "12px 16px",
          marginBottom: 16,
          borderRadius: 8,
          background: "rgba(239,68,68,0.1)",
          color: "#ef4444",
        }}>
          {error}
        </div>
      )}

      {kpis && (
        <>
          {/* Source badge */}
          <div style={{ marginBottom: 16 }}>
            <span style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              background: kpis.source === "n8n" ? "rgba(168,85,247,0.15)" : kpis.source === "db" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
              color: kpis.source === "n8n" ? "#a855f7" : kpis.source === "db" ? "#22c55e" : "#3b82f6",
            }}>
              {kpis.source === "n8n" ? "Live n8n" : kpis.source === "db" ? "Live DB" : "Mock data"}
            </span>
          </div>

          {/* KPI Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: kpis.n8nKpis ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}>
            <KPICard label="Total Opportunities" value={String(kpis.totalOpportunities)} />
            {kpis.n8nKpis ? (
              <>
                <KPICard label="Weighted Pipeline" value={kpis.n8nKpis.weightedPipeline} accent="#8b5cf6" />
                <KPICard label="Pursue" value={String(kpis.n8nKpis.pursueCount)} accent="#22c55e" />
                <KPICard label="Evaluate" value={String(kpis.n8nKpis.evaluateCount)} accent="#f59e0b" />
                <KPICard label="Monitor" value={String(kpis.n8nKpis.monitorCount)} accent="#6b7280" />
              </>
            ) : (
              <>
                <KPICard label="Pipeline Value" value={formatCurrency(kpis.totalPipelineValue)} accent="#8b5cf6" />
                <KPICard label="Avg Pwin" value={formatPwin(kpis.avgPwin)} />
                <KPICard label="Avg Score" value={kpis.avgScore.toFixed(1)} />
              </>
            )}
          </div>

          {/* Command Signals — 4-column grid */}
          {signals && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              marginBottom: 24,
            }}>
              {/* Fast-Track Signals */}
              <SignalCard
                title="Fast-Track Signals"
                icon="⚡"
                count={signals.fastTrackSignals.length}
                accentColor="#f59e0b"
              >
                {signals.fastTrackSignals.map((ft, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < signals.fastTrackSignals.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: URGENCY_COLORS[ft.urgency],
                        display: "inline-block",
                      }} />
                      {ft.opportunity_title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{ft.signal}</div>
                  </div>
                ))}
              </SignalCard>

              {/* Active Risks */}
              <SignalCard
                title="Active Risks"
                icon="🔴"
                count={signals.activeRisks.length}
                accentColor="#ef4444"
              >
                {signals.activeRisks.slice(0, 4).map((risk, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < Math.min(signals.activeRisks.length, 4) - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                        background: risk.likelihood === "high" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                        color: risk.likelihood === "high" ? "#ef4444" : "#f59e0b",
                        textTransform: "uppercase",
                      }}>
                        {risk.likelihood}
                      </span>
                      {risk.opportunity_title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{risk.description}</div>
                  </div>
                ))}
                {signals.activeRisks.length > 4 && (
                  <Link to="/capture" style={{ fontSize: 11, color: "var(--color-primary)", textDecoration: "none", display: "block", marginTop: 6 }}>
                    +{signals.activeRisks.length - 4} more risks →
                  </Link>
                )}
              </SignalCard>

              {/* Upcoming Decisions */}
              <SignalCard
                title="Decisions Pending"
                icon="🎯"
                count={signals.upcomingDecisions.length}
                accentColor="#8b5cf6"
              >
                {signals.upcomingDecisions.slice(0, 4).map((dec, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < Math.min(signals.upcomingDecisions.length, 4) - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{dec.opportunity_title}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", display: "flex", gap: 8 }}>
                      <span>{dec.agency}</span>
                      <span>·</span>
                      <span>{formatCurrency(dec.value_estimated)}</span>
                      <span>·</span>
                      <span style={{ color: "#8b5cf6" }}>{Math.round(dec.pwin)}% Pwin</span>
                    </div>
                    {dec.next_deadline && (
                      <div style={{ fontSize: 10, color: daysUntil(dec.next_deadline) < 14 ? "#ef4444" : "var(--color-text-muted)", marginTop: 2 }}>
                        {dec.next_milestone} — {daysUntil(dec.next_deadline)}d
                      </div>
                    )}
                  </div>
                ))}
              </SignalCard>

              {/* Due-Soon Items + Approvals */}
              <SignalCard
                title="Due Soon"
                icon="📅"
                count={signals.dueSoonItems.length}
                accentColor="#06b6d4"
                badge={signals.approvalsSummary.pending > 0 ? (
                  <Link to="/approvals" style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                    background: signals.approvalsSummary.critical > 0 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: signals.approvalsSummary.critical > 0 ? "#ef4444" : "#f59e0b",
                    textDecoration: "none",
                  }}>
                    {signals.approvalsSummary.pending} approvals{signals.approvalsSummary.critical > 0 ? ` (${signals.approvalsSummary.critical} critical)` : ""}
                  </Link>
                ) : undefined}
              >
                {signals.dueSoonItems.slice(0, 4).map((item, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < Math.min(signals.dueSoonItems.length, 4) - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                        background: `${STATUS_COLORS[item.status] ?? "#6b7280"}20`,
                        color: STATUS_COLORS[item.status] ?? "#6b7280",
                        textTransform: "uppercase",
                      }}>
                        {item.status.replace("_", " ")}
                      </span>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {item.opportunity_title} · {item.owner} · {new Date(item.due_date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {signals.dueSoonItems.length > 4 && (
                  <Link to="/capture" style={{ fontSize: 11, color: "var(--color-primary)", textDecoration: "none", display: "block", marginTop: 6 }}>
                    +{signals.dueSoonItems.length - 4} more due-soon items →
                  </Link>
                )}
              </SignalCard>
            </div>
          )}

          {/* Funnel Visualization */}
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 20,
            marginBottom: 24,
          }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
              Opportunity Funnel
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {kpis.funnel.map((stage) => (
                <FunnelRow key={stage.stage} stage={stage} maxCount={kpis.totalOpportunities} />
              ))}
            </div>
          </div>

          {/* Two-column: Top Opportunities + Quick Access */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}>
            {/* Top Opportunities */}
            <div style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 20,
            }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
                Top Opportunities by Score
              </h2>
              {kpis.topByScore.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>
                  No opportunities found.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {kpis.topByScore.map((opp) => (
                    <TopOppRow key={opp.id} opp={opp} />
                  ))}
                </div>
              )}
            </div>

            {/* Quick Access */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card
                title="QA Center"
                description="Platform health checks, smoke tests, and latest failures."
                to="/qa-center"
                statusColor="var(--color-success)"
              />
              <Card
                title="Ops Tracker"
                description="Opportunity discovery, filtering, sorting, and qualify dry-run."
                to="/ops-tracker"
                statusColor="#f59e0b"
              />
              <Card
                title="Pipeline"
                description="Read-only view of qualified pipeline opportunities."
                to="/pipeline"
                statusColor="#8b5cf6"
              />
              <Card
                title="Doctrine"
                description="Sprint doctrine drafts, finalization gates, and publish history."
                to="/doctrine"
                statusColor="#06b6d4"
              />
              <Card
                title="Intel Hub"
                description="Intelligence feed, morning briefings, deep research, and competitor watch."
                to="/intel"
                statusColor="#ec4899"
              />
              <Card
                title="Capture Planner"
                description="Capture plans, BD activities, milestones, gate reviews, and teaming."
                to="/capture"
                statusColor="#f97316"
              />
              <Card
                title="Approvals Queue"
                description="Human-in-the-loop approvals for qualifications, bid decisions, deployments, and more."
                to="/approvals"
                statusColor="#eab308"
              />
              <Card
                title="Compliance Matrix"
                description="Solicitation requirements, compliance tracking, and FAR/DFARS clause library."
                to="/compliance"
                statusColor="#10b981"
              />
              <Card
                title="Proposal Review"
                description="Track proposals, evaluate volumes, red team findings, scorecards, and submission timelines."
                to="/proposals"
                statusColor="#8b5cf6"
              />
              <Card
                title="Financial Bible"
                description="Drill-down behind every KPI — Orders, Sales, EBIT, ROS, Backlog, Gross Profit."
                to="/financial-bible"
                statusColor="#3b82f6"
              />
              <Card
                title="Workflows"
                description="Browse and manage all n8n automation workflows."
                to="/workflows"
                statusColor="#06b6d4"
              />
              <Card
                title="Settings"
                description="System configuration, connectors, and feature flags."
                to="/settings"
                statusColor="#6b7280"
              />
            </div>
          </div>
        </>
      )}

      {/* Fallback cards when KPIs haven't loaded */}
      {!kpis && !loading && !error && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          <Card title="QA Center" description="Platform health checks, smoke tests, and latest failures." to="/qa-center" statusColor="var(--color-success)" />
          <Card title="Ops Tracker" description="Opportunity discovery and operator management." to="/ops-tracker" statusColor="#f59e0b" />
          <Card title="Pipeline" description="Read-only view of qualified opportunities." to="/pipeline" statusColor="#8b5cf6" />
          <Card title="Doctrine" description="Sprint doctrine drafts, finalization gates, and publish history." to="/doctrine" statusColor="#06b6d4" />
          <Card title="Intel Hub" description="Intelligence feed, morning briefings, deep research, and competitor watch." to="/intel" statusColor="#ec4899" />
          <Card title="Capture Planner" description="Capture plans, BD activities, milestones, gate reviews, and teaming." to="/capture" statusColor="#f97316" />
          <Card title="Approvals Queue" description="Human-in-the-loop approvals for qualifications, bid decisions, deployments, and more." to="/approvals" statusColor="#eab308" />
          <Card title="Compliance Matrix" description="Solicitation requirements, compliance tracking, and FAR/DFARS clause library." to="/compliance" statusColor="#10b981" />
          <Card title="Proposal Review" description="Track proposals, evaluate volumes, red team findings, scorecards, and submission timelines." to="/proposals" statusColor="#8b5cf6" />
          <Card title="Workflows" description="Browse and manage all n8n automation workflows." to="/workflows" statusColor="#06b6d4" />
          <Card title="Settings" description="System configuration, connectors, and feature flags." to="/settings" statusColor="#6b7280" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: "16px 20px",
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--color-text-muted)",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28,
        fontWeight: 700,
        color: accent ?? "var(--color-text)",
      }}>
        {value}
      </div>
    </div>
  );
}

function SignalCard({
  title,
  icon,
  count,
  accentColor,
  badge,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  accentColor: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: 16,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
          <span style={{
            padding: "1px 7px",
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 700,
            background: `${accentColor}20`,
            color: accentColor,
          }}>
            {count}
          </span>
        </div>
        {badge}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
    </div>
  );
}

function FunnelRow({
  stage,
  maxCount,
}: {
  stage: DashboardFunnelStage;
  maxCount: number;
}) {
  const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
  const color = STAGE_COLORS[stage.stage] ?? "#6b7280";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 90,
        fontSize: 13,
        fontWeight: 600,
        textTransform: "capitalize",
        color,
      }}>
        {stage.stage}
      </div>
      <div style={{
        flex: 1,
        height: 28,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          width: `${Math.max(pct, 2)}%`,
          height: "100%",
          background: `${color}40`,
          borderRadius: 6,
          transition: "width 0.4s ease",
        }} />
        <span style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text)",
        }}>
          {stage.count}
        </span>
      </div>
      <div style={{ width: 90, fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>
        {formatCurrency(stage.totalValue)}
      </div>
      <div style={{ width: 60, fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>
        {stage.count > 0 ? formatPwin(stage.avgPwin) : "—"}
      </div>
    </div>
  );
}

function TopOppRow({ opp }: { opp: OpportunityRow }) {
  const stageColor = STAGE_COLORS[opp.status] ?? "#6b7280";
  const scoreColor = opp.score >= 80 ? "#22c55e" : opp.score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <Link
      to={`/opportunities/${opp.id}`}
      state={{ from: "/" }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
    >
      <span style={{
        fontWeight: 700,
        fontSize: 16,
        color: scoreColor,
        width: 40,
        textAlign: "center",
      }}>
        {opp.score.toFixed(0)}
      </span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {opp.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {opp.department ?? "—"} · {formatCurrency(opp.value_estimated)}
        </div>
      </div>
      <span style={{
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        background: `${stageColor}20`,
        color: stageColor,
        textTransform: "capitalize",
      }}>
        {opp.status}
      </span>
    </Link>
  );
}

function Card({
  title,
  description,
  to,
  statusColor,
}: {
  title: string;
  description: string;
  to: string;
  statusColor: string;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        padding: 20,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--color-surface-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--color-surface)")
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor,
            display: "inline-block",
          }}
        />
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
        {description}
      </p>
    </Link>
  );
}
