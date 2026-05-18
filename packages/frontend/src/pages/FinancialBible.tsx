import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area,
} from "recharts";
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  fetchFinancialKPIs,
  fetchFinancialDrillDown,
  fetchMonthlyFinancials,
  type FinancialKPI,
  type FinancialDrillDownData,
  type MonthlyFinancial,
  type MonthlyFinancialsData,
} from "../api/client";

/* ── Formatters ─────────────────────────────────────────────── */

function fmtCurrency(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatByUnit(value: number, unit: string): string {
  if (unit === "percent") return fmtPct(value);
  if (unit === "ratio") return fmtCompact(value);
  return fmtCurrency(value);
}

function formatKPIValue(kpi: FinancialKPI): string {
  return formatByUnit(kpi.current, kpi.unit);
}

/* ── Colors ─────────────────────────────────────────────────── */

const COLORS = {
  revenue: "#3b82f6",
  orders: "#6366f1",
  grossProfit: "#22c55e",
  ebit: "#8b5cf6",
  directCosts: "#ef4444",
  indirectCosts: "#f59e0b",
  target: "#94a3b8",
  positive: "#22c55e",
  negative: "#ef4444",
  warning: "#f59e0b",
};

const KPI_COLORS: Record<string, string> = {
  orders: "#3b82f6",
  sales: "#22c55e",
  ebit: "#8b5cf6",
  ros: "#f59e0b",
  funded_backlog: "#06b6d4",
  backlog: "#6366f1",
  gross_profit: "#ec4899",
};

/* ── Tooltip formatter for Recharts ────────────────────────── */

function currencyTickFormatter(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const tooltipValueFormatter = (value: any): string => fmtCurrency(Number(value ?? 0));

/* ── Main Component ────────────────────────────────────────── */

export default function FinancialBible() {
  const { key } = useParams<{ key?: string }>();
  const [kpis, setKpis] = useState<FinancialKPI[]>([]);
  const [monthly, setMonthly] = useState<MonthlyFinancialsData | null>(null);
  const [drillDown, setDrillDown] = useState<FinancialDrillDownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchFinancialKPIs().then((env) => {
        if (env.success && env.data) setKpis(env.data.kpis);
      }),
      fetchMonthlyFinancials().then((env) => {
        if (env.success && env.data) setMonthly(env.data);
      }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!key) { setDrillDown(null); return; }
    let stale = false;
    setError(null);
    fetchFinancialDrillDown(key)
      .then((env) => {
        if (stale) return;
        if (env.success && env.data) setDrillDown(env.data);
        else setError(env.error?.message ?? "Failed to load drill-down");
      })
      .catch((err) => { if (!stale) setError(err.message); });
    return () => { stale = true; };
  }, [key]);

  if (loading) {
    return <div style={{ padding: 32, color: "var(--color-text-muted)" }}>Loading financial data...</div>;
  }

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

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Financial Bible</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24, fontSize: 14 }}>
        Real-time financial performance — monthly trends, actuals vs targets, variance analysis.
      </p>

      {/* KPI Navigation Cards */}
      <KPIStrip kpis={kpis} activeKey={key} />

      {/* Main content: overview or drill-down */}
      {!key && monthly && <MonthlyOverview data={monthly} />}

      {!key && !monthly && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
          No monthly financial data available. Upload financials to get started.
        </div>
      )}

      {key && error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", borderRadius: 8, padding: 16, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {key && drillDown && drillDown.kpi.key === key && !error && (
        <DrillDownView data={drillDown} monthly={monthly} />
      )}
    </div>
  );
}

/* ── KPI Strip ─────────────────────────────────────────────── */

function KPIStrip({ kpis, activeKey }: { kpis: FinancialKPI[]; activeKey?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 32 }}>
      {kpis.map((kpi) => {
        const isActive = activeKey === kpi.key;
        const color = KPI_COLORS[kpi.key] ?? "#6b7280";
        const changePct = kpi.prior !== 0 ? ((kpi.current - kpi.prior) / kpi.prior) * 100 : 0;
        return (
          <Link key={kpi.key} to={`/financial-bible/${kpi.key}`} style={{
            background: isActive ? `${color}15` : "var(--color-surface)",
            border: isActive ? `2px solid ${color}` : "1px solid var(--color-border)",
            borderRadius: 8, padding: "12px 16px", textDecoration: "none",
            display: "flex", flexDirection: "column", gap: 4, transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? color : "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {kpi.label}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)" }}>
              {formatKPIValue(kpi)}
            </span>
            <span style={{ fontSize: 11, color: changePct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 500 }}>
              {changePct >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(changePct).toFixed(1)}% vs prior
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Monthly Overview (the main new section) ───────────────── */

function MonthlyOverview({ data }: { data: MonthlyFinancialsData }) {
  const { months, ytd, annualTargets } = data;

  if (months.length === 0) {
    return (
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
        No monthly financial data available yet.
      </div>
    );
  }

  const annualRevTarget = annualTargets["sales"] || annualTargets["fin-001"] || 39421155;
  const annualOrdersTarget = annualTargets["orders"] || 39000000;
  const annualEbitTarget = annualTargets["ebit"] || 394812;
  const annualGPTarget = annualTargets["gross_profit"] || 495496;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* YTD Progress Bars */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>YTD vs Annual Target</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <ProgressBar label="Revenue" current={ytd.revenue} target={annualRevTarget} color={COLORS.revenue} />
          <ProgressBar label="Orders" current={ytd.orders} target={annualOrdersTarget} color={COLORS.orders} />
          <ProgressBar label="Gross Profit" current={ytd.grossProfit} target={annualGPTarget} color={COLORS.grossProfit} />
          <ProgressBar label="EBIT" current={ytd.ebit} target={annualEbitTarget} color={COLORS.ebit} />
        </div>
      </div>

      {/* Revenue & Orders Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Monthly Revenue">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={months}>
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.revenue} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={COLORS.revenue} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={currencyTickFormatter} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={tooltipValueFormatter} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Actual" fill="url(#gradRevenue)" radius={[6, 6, 0, 0]} />
              <Line dataKey="revenueTarget" name="Target" stroke={COLORS.target} strokeDasharray="5 5" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Orders">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={months}>
              <defs>
                <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.orders} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={COLORS.orders} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={currencyTickFormatter} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={tooltipValueFormatter} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="orders" name="Actual" fill="url(#gradOrders)" radius={[6, 6, 0, 0]} />
              <Line dataKey="ordersTarget" name="Target" stroke={COLORS.target} strokeDasharray="5 5" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Profitability & Cost Breakdown — 2-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Monthly Profitability">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={months}>
              <defs>
                <linearGradient id="gradGrossProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.grossProfit} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={COLORS.grossProfit} stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="gradEbit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.ebit} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={COLORS.ebit} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={currencyTickFormatter} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={tooltipValueFormatter} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="grossProfit" name="Gross Profit" fill="url(#gradGrossProfit)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="ebit" name="EBIT" fill="url(#gradEbit)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue vs Cost Breakdown">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={months}>
              <defs>
                <linearGradient id="gradRevenueArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.revenue} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.revenue} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradDirectCosts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.directCosts} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COLORS.directCosts} stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="gradIndirectCosts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.indirectCosts} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COLORS.indirectCosts} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={currencyTickFormatter} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={tooltipValueFormatter} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="revenue" name="Revenue" fill="url(#gradRevenueArea)" stroke={COLORS.revenue} strokeWidth={2} />
              <Bar dataKey="directCosts" name="Direct Costs" fill="url(#gradDirectCosts)" stackId="costs" radius={[2, 2, 0, 0]} />
              <Bar dataKey="indirectCosts" name="Indirect Costs" fill="url(#gradIndirectCosts)" stackId="costs" radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Monthly Breakdown Table */}
      <MonthlyTable months={months} ytd={ytd} />

      {/* Variance Analysis */}
      <VarianceAnalysis months={months} />
    </div>
  );
}

/* ── Progress Bar ──────────────────────────────────────────── */

function ProgressBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target > 0 ? (current / target) * 100 : 0;
  const expectedPct = getExpectedPct();
  const isAhead = pct >= expectedPct;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {fmtCurrency(current)} / {fmtCurrency(target)}
        </span>
      </div>
      <div style={{ position: "relative", height: 24, background: "var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.min(pct, 100)}%`,
          background: color, borderRadius: 12, transition: "width 0.5s ease",
        }} />
        {/* Expected pace marker */}
        <div style={{
          position: "absolute", top: 0, left: `${expectedPct}%`, width: 2,
          height: "100%", background: "var(--color-text)", opacity: 0.3,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isAhead ? COLORS.positive : COLORS.negative }}>
          {pct.toFixed(1)}% of target
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Expected pace: {expectedPct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function getExpectedPct(): number {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  return ((month + 1) / 12) * 100;
}

/* ── Monthly Breakdown Table ───────────────────────────────── */

function MonthlyTable({ months, ytd }: { months: MonthlyFinancial[]; ytd: MonthlyFinancialsData["ytd"] }) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, padding: "14px 16px", margin: 0, borderBottom: "1px solid var(--color-border)" }}>
        Monthly Financial Summary
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)", background: "rgba(59,130,246,0.04)" }}>
              <TH align="left">Metric</TH>
              {months.map((m) => <TH key={m.month} align="right">{m.label}</TH>)}
              <TH align="right" style={{ fontWeight: 700 }}>YTD</TH>
            </tr>
          </thead>
          <tbody>
            <MetricRow label="Revenue" months={months} ytd={ytd.revenue} field="revenue" targetField="revenueTarget" />
            <MetricRow label="Orders" months={months} ytd={ytd.orders} field="orders" targetField="ordersTarget" />
            <MetricRow label="Direct Costs" months={months} ytd={ytd.directCosts} field="directCosts" negative />
            <MetricRow label="Indirect Costs" months={months} ytd={ytd.indirectCosts} field="indirectCosts" negative />
            <MetricRow label="Gross Profit" months={months} ytd={ytd.grossProfit} field="grossProfit" targetField="grossProfitTarget" highlight />
            <MetricRow label="EBIT" months={months} ytd={ytd.ebit} field="ebit" targetField="ebitTarget" highlight />
            <tr style={{ borderTop: "2px solid var(--color-border)" }}>
              <td style={{ padding: "10px 16px", fontWeight: 600, fontSize: 12, color: "var(--color-text-muted)" }}>Margin %</td>
              {months.map((m) => {
                const margin = m.revenue > 0 ? (m.grossProfit / m.revenue) * 100 : 0;
                return (
                  <td key={m.month} style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: margin >= 0 ? COLORS.positive : COLORS.negative }}>
                    {margin.toFixed(1)}%
                  </td>
                );
              })}
              <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: ytd.revenue > 0 && (ytd.grossProfit / ytd.revenue) >= 0 ? COLORS.positive : COLORS.negative }}>
                {ytd.revenue > 0 ? ((ytd.grossProfit / ytd.revenue) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TH({ children, align, style }: { children: React.ReactNode; align: "left" | "right"; style?: React.CSSProperties }) {
  return (
    <th style={{ textAlign: align, padding: "10px 16px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", ...style }}>
      {children}
    </th>
  );
}

function MetricRow({ label, months, ytd, field, targetField, highlight, negative }: {
  label: string;
  months: MonthlyFinancial[];
  ytd: number;
  field: keyof MonthlyFinancial;
  targetField?: keyof MonthlyFinancial;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <>
      <tr style={{ borderBottom: "1px solid var(--color-border)", background: highlight ? "rgba(34,197,94,0.04)" : undefined }}>
        <td style={{ padding: "10px 16px", fontWeight: highlight ? 700 : 500 }}>{label}</td>
        {months.map((m) => {
          const val = Number(m[field]);
          const tgt = targetField ? Number(m[targetField]) : undefined;
          const isOver = tgt !== undefined && val >= tgt;
          const isUnder = tgt !== undefined && val < tgt;
          return (
            <td key={m.month} style={{
              padding: "10px 16px", textAlign: "right", fontWeight: highlight ? 700 : 500,
              fontVariantNumeric: "tabular-nums",
              color: negative ? COLORS.negative : (highlight ? (isOver ? COLORS.positive : isUnder ? COLORS.warning : undefined) : undefined),
            }}>
              {fmtCurrency(val)}
            </td>
          );
        })}
        <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {fmtCurrency(ytd)}
        </td>
      </tr>
      {targetField && (
        <tr style={{ borderBottom: "1px solid var(--color-border)", background: "rgba(148,163,184,0.06)" }}>
          <td style={{ padding: "4px 16px 8px", fontSize: 11, color: "var(--color-text-muted)", fontStyle: "italic" }}>
            vs Target
          </td>
          {months.map((m) => {
            const val = Number(m[field]);
            const tgt = Number(m[targetField]);
            const diff = val - tgt;
            return (
              <td key={m.month} style={{
                padding: "4px 16px 8px", textAlign: "right", fontSize: 11,
                color: diff >= 0 ? COLORS.positive : COLORS.negative,
              }}>
                {diff >= 0 ? "+" : ""}{fmtCurrency(diff)}
              </td>
            );
          })}
          <td style={{ padding: "4px 16px 8px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)" }}>
            —
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Variance Analysis ─────────────────────────────────────── */

function VarianceAnalysis({ months }: { months: MonthlyFinancial[] }) {
  if (months.length < 2) return null;

  const latest = months[months.length - 1];
  const prior = months[months.length - 2];

  const variances = [
    { metric: "Revenue", current: latest.revenue, prior: prior.revenue, target: latest.revenueTarget },
    { metric: "Orders", current: latest.orders, prior: prior.orders, target: latest.ordersTarget },
    { metric: "Gross Profit", current: latest.grossProfit, prior: prior.grossProfit, target: latest.grossProfitTarget },
    { metric: "EBIT", current: latest.ebit, prior: prior.ebit, target: latest.ebitTarget },
    { metric: "Direct Costs", current: latest.directCosts, prior: prior.directCosts, target: 0 },
    { metric: "Indirect Costs", current: latest.indirectCosts, prior: prior.indirectCosts, target: 0 },
  ];

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, padding: "14px 16px", margin: 0, borderBottom: "1px solid var(--color-border)" }}>
        Variance Analysis — {latest.label} vs {prior.label}
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--color-border)", background: "rgba(59,130,246,0.04)" }}>
            <TH align="left">Metric</TH>
            <TH align="right">{prior.label}</TH>
            <TH align="right">{latest.label}</TH>
            <TH align="right">Change ($)</TH>
            <TH align="right">Change (%)</TH>
            <TH align="right">vs Target</TH>
          </tr>
        </thead>
        <tbody>
          {variances.map((v) => {
            const dollarChange = v.current - v.prior;
            const pctChange = v.prior !== 0 ? (dollarChange / v.prior) * 100 : 0;
            const isCost = v.metric.includes("Cost");
            const changeColor = isCost
              ? (dollarChange <= 0 ? COLORS.positive : COLORS.negative)
              : (dollarChange >= 0 ? COLORS.positive : COLORS.negative);
            const targetDiff = v.target > 0 ? v.current - v.target : null;

            return (
              <tr key={v.metric} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "10px 16px", fontWeight: 500 }}>{v.metric}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(v.prior)}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(v.current)}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: changeColor, fontVariantNumeric: "tabular-nums" }}>
                  {dollarChange >= 0 ? "+" : ""}{fmtCurrency(dollarChange)}
                </td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: changeColor }}>
                  {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                </td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: targetDiff !== null ? (targetDiff >= 0 ? COLORS.positive : COLORS.negative) : "var(--color-text-muted)" }}>
                  {targetDiff !== null ? `${targetDiff >= 0 ? "+" : ""}${fmtCurrency(targetDiff)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Chart Card Wrapper ────────────────────────────────────── */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}

/* ── Drill-Down View (enhanced) ────────────────────────────── */

function DrillDownView({ data, monthly }: { data: FinancialDrillDownData; monthly: MonthlyFinancialsData | null }) {
  const { kpi, line_items, insights } = data;
  const color = KPI_COLORS[kpi.key] ?? "#6b7280";
  const variance_from_plan = kpi.current - kpi.plan;
  const variance_pct = kpi.plan !== 0 ? (variance_from_plan / kpi.plan) * 100 : 0;

  const monthlyField = getMonthlyFieldForKPI(kpi.key);
  const monthlyTargetField = getMonthlyTargetFieldForKPI(kpi.key);

  const chartData = monthly?.months.map((m) => ({
    label: m.label,
    actual: monthlyField ? Number(m[monthlyField]) : 0,
    target: monthlyTargetField ? Number(m[monthlyTargetField]) : 0,
  })) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <SummaryCard label="Current" value={formatKPIValue(kpi)} sub={kpi.period} color={color} />
        <SummaryCard label="Plan" value={formatByUnit(kpi.plan, kpi.unit)} sub="Annual Target" color="#6b7280" />
        <SummaryCard label="Variance" value={kpi.unit === "percent" ? `${((kpi.current - kpi.plan) * 100).toFixed(1)}pp` : formatByUnit(Math.abs(variance_from_plan), kpi.unit)} sub={`${variance_pct >= 0 ? "+" : ""}${variance_pct.toFixed(1)}% vs plan`} color={variance_pct >= 0 ? "#22c55e" : "#f59e0b"} />
        <SummaryCard label="Prior Period" value={formatByUnit(kpi.prior, kpi.unit)} sub="FY25-Q1" color="#6b7280" />
      </div>

      {/* Monthly Trend Chart */}
      {chartData.length > 0 && (
        <ChartCard title={`${kpi.label} — Monthly Trend`}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={currencyTickFormatter} tick={{ fontSize: 11 }} />
              <Tooltip formatter={tooltipValueFormatter} />
              <Legend />
              <Bar dataKey="actual" name="Actual" fill={color} radius={[4, 4, 0, 0]} />
              {monthlyTargetField && (
                <Line dataKey="target" name="Target" stroke={COLORS.target} strokeDasharray="5 5" strokeWidth={2} dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Source Badge */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
          {data.source === "n8n" ? "Live API" : "Live DB"}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Updated {new Date(kpi.updated_at).toLocaleDateString()}
        </span>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{ background: `${color}08`, border: `1px solid ${color}30`, borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color }}>Insights</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {insights.map((insight, i) => (
              <li key={i} style={{ fontSize: 13, color: "var(--color-text)", marginBottom: 4 }}>{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Line Items Table */}
      {line_items.length > 0 && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
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
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(li.amount)}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{li.category}</span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "var(--color-text-muted)" }}>{li.contract_id ?? "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--color-text-muted)" }}>{li.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(59,130,246,0.04)" }}>
                <td style={{ padding: "10px 16px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(line_items.reduce((s, li) => s + li.amount, 0))}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────── */

function getMonthlyFieldForKPI(key: string): keyof MonthlyFinancial | null {
  const map: Record<string, keyof MonthlyFinancial> = {
    "fin-001": "revenue", sales: "revenue", orders: "orders",
    gross_profit: "grossProfit", ebit: "ebit",
    funded_backlog: "fundedBacklog", "fin-006": "fundedBacklog",
  };
  return map[key] ?? null;
}

function getMonthlyTargetFieldForKPI(key: string): keyof MonthlyFinancial | null {
  const map: Record<string, keyof MonthlyFinancial> = {
    "fin-001": "revenueTarget", sales: "revenueTarget", orders: "ordersTarget",
    gross_profit: "grossProfitTarget", ebit: "ebitTarget",
  };
  return map[key] ?? null;
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "12px 16px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
