"use client";

import { useKpiHeader } from "@/hooks/use-kpi";
import { PendingState } from "@/components/shared/pending-state";
import { CollapseSection } from "@/components/shared/collapse-section";
import { formatMoney } from "@/lib/format-money";
import { FinancialCard } from "@/components/financials/FinancialCard";
import { ForecastChart } from "@/components/financials/ForecastChart";
import { TrendChart } from "@/components/financials/TrendChart";

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
