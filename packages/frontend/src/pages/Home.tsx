import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchDashboardKPIs,
  type DashboardKPIs,
  type DashboardFunnelStage,
  type OpportunityRow,
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

const STAGE_COLORS: Record<string, string> = {
  discovery: "#f59e0b",
  qualified: "#3b82f6",
  pipeline: "#8b5cf6",
  won: "#22c55e",
  lost: "#ef4444",
};

export default function Home() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardKPIs()
      .then((env) => {
        if (env.success && env.data) {
          setKpis(env.data);
        } else {
          setError(env.error?.message ?? "Failed to load dashboard");
        }
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

      {/* KPI Strip */}
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
              background: kpis.source === "db" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
              color: kpis.source === "db" ? "#22c55e" : "#3b82f6",
            }}>
              {kpis.source === "db" ? "Live DB" : "Mock data"}
            </span>
          </div>

          {/* KPI Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}>
            <KPICard label="Total Opportunities" value={String(kpis.totalOpportunities)} />
            <KPICard label="Pipeline Value" value={formatCurrency(kpis.totalPipelineValue)} accent="#8b5cf6" />
            <KPICard label="Avg Pwin" value={formatPwin(kpis.avgPwin)} />
            <KPICard label="Avg Score" value={kpis.avgScore.toFixed(1)} />
          </div>

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
          <Card
            title="QA Center"
            description="Platform health checks, smoke tests, and latest failures."
            to="/qa-center"
            statusColor="var(--color-success)"
          />
          <Card
            title="Ops Tracker"
            description="Opportunity discovery and operator management."
            to="/ops-tracker"
            statusColor="#f59e0b"
          />
          <Card
            title="Pipeline"
            description="Read-only view of qualified opportunities."
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
        </div>
      )}
    </div>
  );
}

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
