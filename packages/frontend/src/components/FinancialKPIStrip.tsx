import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFinancialKPIs, type FinancialKPI } from "../api/client";

function formatValue(kpi: FinancialKPI): string {
  if (kpi.unit === "percent") return `${(kpi.current * 100).toFixed(1)}%`;
  if (kpi.current >= 1_000_000_000) return `$${(kpi.current / 1_000_000_000).toFixed(1)}B`;
  if (kpi.current >= 1_000_000) return `$${(kpi.current / 1_000_000).toFixed(1)}M`;
  if (kpi.current >= 1_000) return `$${(kpi.current / 1_000).toFixed(0)}K`;
  return `$${kpi.current.toFixed(0)}`;
}

function changeIndicator(kpi: FinancialKPI): { label: string; color: string; arrow: string } {
  const diff = kpi.current - kpi.prior;
  const pct = kpi.prior !== 0 ? (diff / kpi.prior) * 100 : 0;
  if (pct > 0) return { label: `+${pct.toFixed(1)}%`, color: "#22c55e", arrow: "\u25B2" };
  if (pct < 0) return { label: `${pct.toFixed(1)}%`, color: "#ef4444", arrow: "\u25BC" };
  return { label: "0%", color: "var(--color-text-muted)", arrow: "\u25AC" };
}

function planIndicator(kpi: FinancialKPI): { label: string; color: string } {
  const diff = kpi.current - kpi.plan;
  const pct = kpi.plan !== 0 ? (diff / kpi.plan) * 100 : 0;
  if (pct >= 0) return { label: `${pct.toFixed(1)}% above plan`, color: "#22c55e" };
  return { label: `${Math.abs(pct).toFixed(1)}% below plan`, color: "#f59e0b" };
}

export default function FinancialKPIStrip() {
  const [kpis, setKpis] = useState<FinancialKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetchFinancialKPIs()
      .then((env) => {
        if (env.success && env.data) setKpis(env.data.kpis);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "6px 24px",
        fontSize: 12,
        color: "var(--color-text-muted)",
      }}>
        Loading financial KPIs...
      </div>
    );
  }

  if (kpis.length === 0) return null;

  return (
    <div style={{
      background: "var(--color-surface)",
      borderBottom: "1px solid var(--color-border)",
      padding: collapsed ? "4px 24px" : "8px 24px",
      transition: "padding 0.2s",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{
          display: "flex",
          gap: collapsed ? 16 : 24,
          alignItems: "center",
          flex: 1,
          overflowX: "auto",
        }}>
          {kpis.map((kpi) => {
            const change = changeIndicator(kpi);
            const plan = planIndicator(kpi);

            return (
              <Link
                key={kpi.key}
                to={`/financial-bible/${kpi.key}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: collapsed ? 0 : 2,
                  padding: "4px 8px",
                  borderRadius: 6,
                  minWidth: collapsed ? 80 : 110,
                  cursor: "pointer",
                  textDecoration: "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(59,130,246,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                title={`${kpi.label}: ${formatValue(kpi)} — ${plan.label} (${kpi.period})`}
              >
                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  whiteSpace: "nowrap",
                }}>
                  {kpi.label}
                </span>

                <span style={{
                  fontSize: collapsed ? 14 : 18,
                  fontWeight: 700,
                  color: "var(--color-text)",
                  lineHeight: 1,
                }}>
                  {formatValue(kpi)}
                </span>

                {!collapsed && (
                  <span style={{
                    fontSize: 10,
                    color: change.color,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}>
                    {change.arrow} {change.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
          }}>
            {kpis[0]?.period}
          </span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "none",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 10,
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
            title={collapsed ? "Expand KPI strip" : "Collapse KPI strip"}
          >
            {collapsed ? "\u25BC" : "\u25B2"}
          </button>
        </div>
      </div>
    </div>
  );
}
