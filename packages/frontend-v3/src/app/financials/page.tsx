"use client";

import { useKpiHeader } from "@/hooks/use-kpi";
import { useFinancialsForecast, useFinancialsTrend } from "@/hooks/use-financials";
import { Card, CardContent } from "@/components/ui/card";
import { PendingState } from "@/components/shared/pending-state";
import { SourceChip } from "@/components/shared/source-chip";
import { CollapseSection } from "@/components/shared/collapse-section";
import { formatMoney } from "@/lib/format-money";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function FinancialsPage() {
  const { data, isLoading } = useKpiHeader();

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Financial Bible
      </h1>
      <p className="text-sm text-muted-foreground">
        Single source of truth for Orders, Sales, EBIT, Gross Margin, and ROS.
        All figures are sourced from the financial planning system.
      </p>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-gda-panel" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-5">
          <FinancialCard
            label="Orders"
            value={formatMoney(data.orders.value)}
            plan={formatMoney(data.orders.plan)}
            delta={data.orders.delta}
          />
          <FinancialCard
            label="Sales"
            value={formatMoney(data.sales.value)}
            plan={formatMoney(data.sales.plan)}
            delta={data.sales.delta}
          />
          <FinancialCard
            label="EBIT"
            value={formatMoney(data.ebit.value)}
            plan={formatMoney(data.ebit.plan)}
            delta={data.ebit.delta}
          />
          <FinancialCard
            label="Gross Margin"
            value={`${data.gross_margin.value.toFixed(1)}%`}
            plan={`${data.gross_margin.plan.toFixed(1)}%`}
            delta={data.gross_margin.delta}
          />
          <FinancialCard
            label="ROS"
            value={`${data.ros.value.toFixed(1)}%`}
            plan={`${data.ros.plan.toFixed(1)}%`}
            delta={data.ros.delta}
          />
        </div>
      ) : (
        <PendingState
          surface="Financial KPIs"
          reason="Activates with the financial planning integration. Connect your ERP or upload a plan to see real KPIs."
        />
      )}

      <CollapseSection
        id="fin-pipeline-forecast"
        title="Pipeline Forecast vs Plan"
        defaultOpen={false}
      >
        <ForecastChart />
      </CollapseSection>

      <CollapseSection
        id="fin-trend"
        title="Historical Trend"
        defaultOpen={false}
      >
        <TrendChart />
      </CollapseSection>
    </div>
  );
}

function ForecastChart() {
  const { data, isLoading } = useFinancialsForecast();

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  if (!data?.items.length) {
    return <p className="text-xs text-muted-foreground">No forecast data yet</p>;
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.items}>
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tickFormatter={(v: number) => formatMoney(v)}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            contentStyle={{ backgroundColor: "#0a0f1a", border: "1px solid #1e293b" }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#e2e8f0" }}
          />
          <Legend />
          <Bar dataKey="actual_orders" name="Actual Orders" fill="#22d3ee" />
          <Bar dataKey="plan_orders" name="Plan Orders" fill="#334155" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart() {
  const { data, isLoading } = useFinancialsTrend();

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  if (!data?.items.length) {
    return <p className="text-xs text-muted-foreground">No trend data yet</p>;
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.items}>
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tickFormatter={(v: number) => formatMoney(v)}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            contentStyle={{ backgroundColor: "#0a0f1a", border: "1px solid #1e293b" }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#e2e8f0" }}
          />
          <Legend />
          <Line type="monotone" dataKey="orders" name="Orders" stroke="#22d3ee" dot={false} />
          <Line type="monotone" dataKey="sales" name="Sales" stroke="#4ade80" dot={false} />
          <Line type="monotone" dataKey="ebit" name="EBIT" stroke="#f59e0b" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FinancialCard({
  label,
  value,
  plan,
  delta,
}: {
  label: string;
  value: string;
  plan: string;
  delta: number;
}) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardContent className="py-4">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums">
          {value}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Plan: {plan}</span>
          <span
            className={
              delta >= 0 ? "text-gda-green-muted" : "text-gda-red"
            }
          >
            {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}%
          </span>
        </div>
        <SourceChip
          label="Financial Bible"
          kind="real"
          className="mt-2"
        />
      </CardContent>
    </Card>
  );
}
