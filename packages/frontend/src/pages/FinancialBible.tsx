import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchFinancialKPIs,
  fetchFinancialDrillDown,
  type FinancialKPI,
  type FinancialDrillDownData,
} from "../api/client";

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatCount(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function formatByUnit(value: number, unit: string): string {
  if (unit === "percent") return `${(value * 100).toFixed(1)}%`;
  if (unit === "ratio") return formatCount(value);
  return formatCurrency(value);
}

function formatKPIValue(kpi: FinancialKPI): string {
  return formatByUnit(kpi.current, kpi.unit);
}

const KPI_COLORS: Record<string, string> = {
  orders: "#3b82f6",
  sales: "#22c55e",
  ebit: "#8b5cf6",
  ros: "#f59e0b",
  funded_backlog: "#06b6d4",
  backlog: "#6366f1",
  gross_profit: "#ec4899",
};

export default function FinancialBible() {
  const { key } = useParams<{ key?: string }>();
  const [kpis, setKpis] = useState<FinancialKPI[]>([]);
  const [drillDown, setDrillDown] = useState<FinancialDrillDownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFinancialKPIs()
      .then((env) => {
        if (env.success && env.data) setKpis(env.data.kpis);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!key) {
      setDrillDown(null);
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    setError(null);
    fetchFinancialDrillDown(key)
      .then((env) => {
        if (stale) return;
        if (env.success && env.data) {
          setDrillDown(env.data);
        } else {
          setError(env.error?.message ?? "Failed to load drill-down");
        }
      })
      .catch((err) => { if (!stale) setError(err.message); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [key]);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
        <Link to="/" style={{ color: "var(--color-primary)" }}>Launchpad</Link>
        {" / "}
        {key ? (
          <>
            <Link to="/financial-bible" style={{ color: "var(--color-primary)" }}>Financial Bible</Link>
            {" / "}
            <span>{(drillDown && drillDown.kpi.key === key) ? drillDown.kpi.label : key}</span>
          </>
        ) : (
          <span>Financial Bible</span>
        )}
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Financial Bible
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24, fontSize: 14 }}>
        The drill-down behind every KPI. Where the numbers become explainable.
      </p>

      {/* KPI Navigation Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 32,
      }}>
        {kpis.map((kpi) => {
          const isActive = key === kpi.key;
          const color = KPI_COLORS[kpi.key] ?? "#6b7280";
          const changePct = kpi.prior !== 0 ? ((kpi.current - kpi.prior) / kpi.prior) * 100 : 0;

          return (
            <Link
              key={kpi.key}
              to={`/financial-bible/${kpi.key}`}
              style={{
                background: isActive
                  ? `${color}15`
                  : "var(--color-surface)",
                border: isActive
                  ? `2px solid ${color}`
                  : "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "12px 16px",
                textDecoration: "none",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                transition: "all 0.15s",
              }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: isActive ? color : "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {kpi.label}
              </span>
              <span style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--color-text)",
              }}>
                {formatKPIValue(kpi)}
              </span>
              <span style={{
                fontSize: 11,
                color: changePct >= 0 ? "#22c55e" : "#ef4444",
                fontWeight: 500,
              }}>
                {changePct >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(changePct).toFixed(1)}% vs prior
              </span>
            </Link>
          );
        })}
      </div>

      {/* Contract Revenue Waterfall + prompt to select a KPI */}
      {!key && <ContractWaterfall kpis={kpis} />}

      {key && loading && (
        <div style={{ color: "var(--color-text-muted)", padding: 24 }}>
          Loading {key} drill-down...
        </div>
      )}

      {key && error && (
        <div style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid #ef4444",
          borderRadius: 8,
          padding: 16,
          color: "#ef4444",
        }}>
          {error}
        </div>
      )}

      {key && drillDown && drillDown.kpi.key === key && !loading && !error && (
        <DrillDownView data={drillDown} />
      )}
    </div>
  );
}

function DrillDownView({ data }: { data: FinancialDrillDownData }) {
  const { kpi, line_items, trends, variance_from_plan, variance_pct, insights } = data;
  const color = KPI_COLORS[kpi.key] ?? "#6b7280";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary Cards Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}>
        <SummaryCard
          label="Current"
          value={formatKPIValue(kpi)}
          sub={kpi.period}
          color={color}
        />
        <SummaryCard
          label="Plan"
          value={formatByUnit(kpi.plan, kpi.unit)}
          sub="Target"
          color="#6b7280"
        />
        <SummaryCard
          label="Variance"
          value={kpi.unit === "percent"
            ? `${((kpi.current - kpi.plan) * 100).toFixed(1)}pp`
            : formatByUnit(Math.abs(variance_from_plan), kpi.unit)}
          sub={`${variance_pct >= 0 ? "+" : ""}${variance_pct.toFixed(1)}% vs plan`}
          color={variance_pct >= 0 ? "#22c55e" : "#f59e0b"}
        />
        <SummaryCard
          label="Prior Period"
          value={formatByUnit(kpi.prior, kpi.unit)}
          sub={`FY25-Q1`}
          color="#6b7280"
        />
      </div>

      {/* Source Badge */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: "rgba(34,197,94,0.15)",
          color: "#22c55e",
        }}>
          {data.source === "n8n" ? "Live API" : "Live DB"}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Updated {new Date(kpi.updated_at).toLocaleDateString()}
        </span>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{
          background: `${color}08`,
          border: `1px solid ${color}30`,
          borderRadius: 8,
          padding: 16,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color }}>
            Insights
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {insights.map((insight, i) => (
              <li key={i} style={{ fontSize: 13, color: "var(--color-text)", marginBottom: 4 }}>
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trend Chart (simple bar visualization) */}
      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 16,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Trend — Last 6 Periods
        </h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
          {trends.map((t) => {
            const maxVal = Math.max(...trends.map((tr) => tr.value));
            const height = maxVal > 0 ? (t.value / maxVal) * 100 : 0;
            const isCurrentPeriod = t.period === kpi.period;

            return (
              <div
                key={t.period}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  {formatByUnit(t.value, kpi.unit)}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${height}%`,
                    minHeight: 4,
                    background: isCurrentPeriod ? color : `${color}60`,
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s",
                  }}
                />
                <span style={{
                  fontSize: 9,
                  color: isCurrentPeriod ? color : "var(--color-text-muted)",
                  fontWeight: isCurrentPeriod ? 600 : 400,
                  whiteSpace: "nowrap",
                }}>
                  {t.period}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Line Items Table */}
      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, padding: "12px 16px", margin: 0, borderBottom: "1px solid var(--color-border)" }}>
          Constituent Records ({line_items.length})
        </h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase" }}>Description</th>
              <th style={{ textAlign: "right", padding: "8px 16px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase" }}>Amount</th>
              <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase" }}>Category</th>
              <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase" }}>Contract</th>
              <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {line_items.map((li) => (
              <tr key={li.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "10px 16px", fontWeight: 500 }}>{li.label}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrency(li.amount)}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    background: "rgba(99,102,241,0.1)",
                    color: "#6366f1",
                  }}>
                    {li.category}
                  </span>
                </td>
                <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "var(--color-text-muted)" }}>
                  {li.contract_id ?? "—"}
                </td>
                <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--color-text-muted)" }}>
                  {li.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "rgba(59,130,246,0.04)" }}>
              <td style={{ padding: "10px 16px", fontWeight: 700 }}>Total</td>
              <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(line_items.reduce((s, li) => s + li.amount, 0))}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: "12px 16px",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contract Revenue Waterfall — shows expected revenue by quarter
// ---------------------------------------------------------------------------

interface WaterfallBar {
  label: string;
  value: number;
  color: string;
  cumulative: number;
}

function ContractWaterfall({ kpis }: { kpis: FinancialKPI[] }) {
  const salesKpi = kpis.find((k) => k.key === "sales");
  const backlogKpi = kpis.find((k) => k.key === "fin-006" || k.key === "backlog");
  const fundedKpi = kpis.find((k) => k.key === "funded_backlog");
  const ordersKpi = kpis.find((k) => k.key === "orders");
  const pipelineKpi = kpis.find((k) => k.key === "fin-002");

  const sales = salesKpi?.current ?? 382_000_000;
  const backlog = backlogKpi?.current ?? 347_000_000;
  const funded = fundedKpi?.current ?? 198_000_000;
  const orders = ordersKpi?.current ?? 95_000_000;
  const pipeline = pipelineKpi?.current ?? 2_300_000_000;

  // Build waterfall: Current Revenue → + Funded Backlog → + Unfunded Backlog → + New Orders → + Pipeline Potential
  const unfunded = Math.max(0, backlog - funded);
  const pipelineNet = Math.max(0, pipeline * 0.35 - backlog); // 35% weighted pipeline conversion

  const bars: WaterfallBar[] = [];
  let running = 0;

  bars.push({ label: "Current Revenue", value: sales, color: "#22c55e", cumulative: running });
  running += sales;

  bars.push({ label: "Funded Backlog", value: funded, color: "#3b82f6", cumulative: running });
  running += funded;

  bars.push({ label: "Unfunded Backlog", value: unfunded, color: "#8b5cf6", cumulative: running });
  running += unfunded;

  bars.push({ label: "New Orders (YTD)", value: orders, color: "#06b6d4", cumulative: running });
  running += orders;

  bars.push({ label: "Pipeline (35% weighted)", value: pipelineNet, color: "#f59e0b", cumulative: running });
  running += pipelineNet;

  bars.push({ label: "Total Expected", value: running, color: "#22c55e", cumulative: 0 });

  const maxVal = running;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 24,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Contract Revenue Waterfall
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 20 }}>
          Expected contract revenue progression — from current recognized revenue through backlog, orders, and weighted pipeline potential.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bars.map((bar, i) => {
            const isTotal = i === bars.length - 1;
            const barWidth = maxVal > 0 ? (bar.value / maxVal) * 100 : 0;
            const offsetWidth = maxVal > 0 ? (bar.cumulative / maxVal) * 100 : 0;

            return (
              <div key={bar.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 170,
                  fontSize: 12,
                  fontWeight: isTotal ? 700 : 500,
                  color: isTotal ? "var(--color-text)" : "var(--color-text-muted)",
                  textAlign: "right",
                  flexShrink: 0,
                }}>
                  {bar.label}
                </div>
                <div style={{
                  flex: 1,
                  height: 28,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  position: "relative",
                  overflow: "hidden",
                }}>
                  {isTotal ? (
                    <div style={{
                      width: `${barWidth}%`,
                      height: "100%",
                      background: `${bar.color}60`,
                      borderRadius: 6,
                      border: `1px solid ${bar.color}`,
                    }} />
                  ) : (
                    <div style={{
                      position: "absolute",
                      left: `${offsetWidth}%`,
                      width: `${barWidth}%`,
                      height: "100%",
                      background: `${bar.color}50`,
                      borderRadius: 4,
                    }} />
                  )}
                </div>
                <div style={{
                  width: 90,
                  fontSize: 13,
                  fontWeight: isTotal ? 700 : 600,
                  color: isTotal ? bar.color : "var(--color-text)",
                  textAlign: "right",
                  flexShrink: 0,
                }}>
                  {formatCurrency(bar.value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 32,
        textAlign: "center",
        color: "var(--color-text-muted)",
      }}>
        Select a KPI above to view its drill-down detail.
      </div>
    </div>
  );
}
