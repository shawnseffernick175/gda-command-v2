import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchFinancialKPIs, type FinancialKPI } from "../api/client";
import InfoBadge from "./InfoBadge";

const KPI_INFO: Record<string, { whatItIs: string; whatItMeans: string; howCalculated?: string }> = {
  orders: {
    whatItIs: "Total value of new contracts and task orders booked.",
    whatItMeans: "Measures new business secured. Target: stay above plan to ensure revenue growth.",
    howCalculated: "Sum of all new contract awards + task order modifications in the current period.",
  },
  sales: {
    whatItIs: "Revenue recognized from contract performance.",
    whatItMeans: "Actual revenue earned and billed. Lag indicator — depends on contract execution.",
    howCalculated: "Sum of invoiced amounts for work performed in the current period.",
  },
  ebit: {
    whatItIs: "Earnings Before Interest & Taxes — measures operating profitability.",
    whatItMeans: "Core business profitability before financing costs. Higher EBIT = healthier operations.",
    howCalculated: "Sales − Cost of Goods Sold − Operating Expenses (SG&A).",
  },
  ros: {
    whatItIs: "Return on Sales — EBIT as a percentage of Sales.",
    whatItMeans: "Profit margin on each dollar of revenue. Industry benchmark: 8-12% for GovCon.",
    howCalculated: "(EBIT ÷ Sales) × 100%.",
  },
  funded_backlog: {
    whatItIs: "Contracted work that has received government funding authorization.",
    whatItMeans: "Near-term revenue visibility. This work can begin immediately.",
    howCalculated: "Sum of funded ceiling on active contracts minus revenue already recognized.",
  },
  backlog: {
    whatItIs: "Contract Backlog — total remaining value on all active contracts (funded + unfunded).",
    whatItMeans: "Long-term revenue pipeline. Higher contract backlog = more future revenue security.",
    howCalculated: "Sum of total contract ceiling minus revenue recognized across all active contracts.",
  },
  gross_profit: {
    whatItIs: "Revenue minus direct costs (labor, materials, subcontractors).",
    whatItMeans: "Measures contract-level profitability before overhead and SG&A.",
    howCalculated: "Sales − Direct Costs (labor + materials + subcontracts + ODCs).",
  },
};

function formatValue(kpi: FinancialKPI): string {
  if (kpi.unit === "percent") return `${(kpi.current * 100).toFixed(1)}%`;
  const prefix = kpi.unit === "ratio" ? "" : "$";
  if (kpi.current >= 1_000_000_000) return `${prefix}${(kpi.current / 1_000_000_000).toFixed(1)}B`;
  if (kpi.current >= 1_000_000) return `${prefix}${(kpi.current / 1_000_000).toFixed(1)}M`;
  if (kpi.current >= 1_000) return `${prefix}${(kpi.current / 1_000).toFixed(0)}K`;
  return `${prefix}${kpi.current.toFixed(0)}`;
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
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<FinancialKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFinancialKPIs()
      .then((env) => {
        if (!cancelled && env.success && env.data) {
          const priorityOrder = ["orders", "sales", "ebit", "gross_profit", "ros", "funded_backlog", "fin-006"];
          const sorted = [...env.data.kpis].sort((a, b) => {
            const ai = priorityOrder.indexOf(a.key);
            const bi = priorityOrder.indexOf(b.key);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1;
            if (bi >= 0) return 1;
            return 0;
          });
          setKpis(sorted);
        }
      })
      .catch(() => {
        if (!cancelled && retryCount < 3) {
          const delay = Math.min(2000 * 2 ** retryCount, 8000);
          setTimeout(() => { if (!cancelled) setRetryCount((c) => c + 1); }, delay);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retryCount]);

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

  if (kpis.length === 0) {
    return (
      <div style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "6px 24px",
        fontSize: 12,
        color: "var(--color-text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span>Financial KPIs unavailable</span>
        <button
          onClick={() => setRetryCount((c) => c + 1)}
          style={{
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

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
              <div
                key={kpi.key}
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button[title="More info"]')) return;
                  navigate(`/financial-bible/${kpi.key}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/financial-bible/${kpi.key}`);
                }}
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
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}>
                  {kpi.label}
                  {KPI_INFO[kpi.key] && <InfoBadge {...KPI_INFO[kpi.key]} size={12} />}
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
              </div>
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
